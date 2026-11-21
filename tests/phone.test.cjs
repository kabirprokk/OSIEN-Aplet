const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { PhoneReader } = require('../src/phone.cjs');

const media = { name: 'sample.JPG', segments: ['Internal Storage', 'DCIM', 'sample.JPG'],
  size: 5, date: '2024-05-06', dateSource: 'capture date', type: 'Photos' };

test('phone import resolves opaque IDs to server-owned paths and copies without changing originals', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'aplet-phone-test-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const progress = [];
  const reader = new PhoneReader(async (request, onProgress = () => {}) => {
    if (request.action === 'scan') return { device: 'test phone', files: [media], errors: [] };
    assert.deepEqual(request.segments, media.segments);
    const output = path.join(request.destination, media.name);
    onProgress({ bytes: 2, totalBytes: 5 });
    await fs.writeFile(output, 'photo');
    onProgress({ bytes: 5, totalBytes: 5 });
    return { path: output, size: 5 };
  });
  const scan = await reader.scan();
  assert.equal(scan.files[0].segments, undefined);
  const results = await reader.import([scan.files[0].id], destination, event => progress.push(event));
  assert.equal(results[0].ok, true);
  assert.equal(await fs.readFile(path.join(destination, 'Photos', media.date, media.name), 'utf8'), 'photo');
  assert.deepEqual(await fs.readdir(destination), ['Photos']);
  assert.deepEqual(progress.map(event => event.phase), ['transfer', 'transfer', 'transfer', 'saving', 'saved']);
  assert.equal(progress[1].bytes, 2);
  assert.equal(progress[1].currentTotalBytes, media.size);
  assert.equal(progress[2].bytes, media.size);
  assert.equal(progress[3].bytes, media.size);
  assert.equal(progress[4].bytes, media.size);
  await assert.rejects(reader.import(['forged-id'], destination), /Read the iPhone again/);
});

test('phone import can save directly into the selected destination', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'aplet-phone-flat-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const reader = new PhoneReader(async request => {
    if (request.action === 'scan') return { files: [media], errors: [] };
    const output = path.join(request.destination, media.name);
    await fs.writeFile(output, 'photo');
    return { path: output, size: 5 };
  });
  const scan = await reader.scan();
  const results = await reader.import([scan.files[0].id], destination, () => {}, 'flat');
  assert.equal(results[0].ok, true);
  assert.deepEqual(await fs.readdir(destination), [media.name]);
});

test('phone scan streams discovered media with stable opaque IDs and no source paths', async () => {
  const streamed = [];
  const reader = new PhoneReader(async (_request, progress) => {
    const discovered = { ...media, segments: media.segments };
    progress({ found: 1, elapsedMs: 20, items: [discovered] });
    return { device: 'test phone', files: [discovered], errors: [] };
  });
  const result = await reader.scan(event => streamed.push(event));
  assert.equal(streamed[0].files.length, 1);
  assert.equal(streamed[0].files[0].id, result.files[0].id);
  assert.equal(streamed[0].files[0].segments, undefined);
  assert.equal(reader.files.get(result.files[0].id).segments.length, media.segments.length);
});

test('phone scan accepts a streamed library with a summary-only final response', async () => {
  const reader = new PhoneReader(async (_request, progress) => {
    progress({ found: 1, elapsedMs: 10, items: [media] });
    return { count: 1, errors: [], device: 'test phone' };
  });
  const result = await reader.scan();
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, media.name);
  assert.equal(result.files[0].segments, undefined);
  assert.equal(reader.files.get(result.files[0].id).segments.length, media.segments.length);
});

test('phone scan keeps media with the same Shell name and different extensions distinct', async () => {
  const photo = { ...media, segments: ['Internal Storage', 'DCIM', { name: 'IMG_1292', filename: 'IMG_1292.JPG' }] };
  const video = { ...media, name: 'IMG_1292.MOV', type: 'Videos',
    segments: ['Internal Storage', 'DCIM', { name: 'IMG_1292', filename: 'IMG_1292.MOV' }] };
  const reader = new PhoneReader(async (_request, progress) => {
    progress({ found: 2, items: [photo, video] });
    return { count: 2, errors: [] };
  });
  const result = await reader.scan();
  assert.equal(result.files.length, 2);
  assert.notEqual(result.files[0].id, result.files[1].id);
});

test('a failed transfer stops the batch, preserves staging, and allows another scan', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'aplet-phone-test-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  let copies = 0;
  const reader = new PhoneReader(async request => {
    if (request.action === 'scan') return { device: 'test phone', files: [media, media], errors: [] };
    copies++;
    throw new Error('Phone disconnected');
  });
  const scan = await reader.scan();
  const results = await reader.import(scan.files.map(f => f.id), destination);
  assert.equal(copies, 1);
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /Phone disconnected/);
  assert.equal((await fs.readdir(destination)).length, 1);
  assert.equal(reader.busy, false);
  const next = await reader.scan();
  assert.notEqual(next.files[0].id, scan.files[0].id);
});

test('phone import reports failure when the organized file size differs from the transfer', async t => {
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'aplet-phone-test-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const reader = new PhoneReader(async request => {
    if (request.action === 'scan') return { files: [media], errors: [] };
    const output = path.join(request.destination, media.name);
    await fs.writeFile(output, 'photo');
    return { path: output, size: 6 };
  });
  const scan = await reader.scan();
  const results = await reader.import([scan.files[0].id], destination);
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /could not be verified/);
});

test('concurrent scans are refused until the active scan finishes', async () => {
  let finish;
  const reader = new PhoneReader(() => new Promise(resolve => { finish = resolve; }));
  const first = reader.scan();
  await assert.rejects(reader.scan(), /Wait for the current/);
  finish({ files: [], errors: [] });
  await first;
  assert.equal(reader.busy, false);
});
