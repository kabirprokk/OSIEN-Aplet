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
  const reader = new PhoneReader(async request => {
    if (request.action === 'scan') return { device: 'test phone', files: [media], errors: [] };
    assert.deepEqual(request.segments, media.segments);
    const output = path.join(request.destination, media.name);
    await fs.writeFile(output, 'photo');
    return { path: output, size: 5 };
  });
  const scan = await reader.scan();
  assert.equal(scan.files[0].segments, undefined);
  const results = await reader.import([scan.files[0].id], destination);
  assert.equal(results[0].ok, true);
  assert.equal(await fs.readFile(path.join(destination, 'Photos', media.date, media.name), 'utf8'), 'photo');
  assert.deepEqual(await fs.readdir(destination), ['Photos']);
  await assert.rejects(reader.import(['forged-id'], destination), /Read the iPhone again/);
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

test('concurrent scans are refused until the active scan finishes', async () => {
  let finish;
  const reader = new PhoneReader(() => new Promise(resolve => { finish = resolve; }));
  const first = reader.scan();
  await assert.rejects(reader.scan(), /Wait for the current/);
  finish({ files: [], errors: [] });
  await first;
  assert.equal(reader.busy, false);
});
