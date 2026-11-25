'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { classify, dateFolder, scanMedia, importMedia } = require('../src/importer.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aplet-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('classifies supported photo and video extensions case-insensitively', () => {
  assert.equal(classify('IMG_0001.HEIC'), 'Photos');
  assert.equal(classify('clip.MOV'), 'Videos');
  assert.equal(classify('notes.txt'), null);
});

test('formats dates as sortable local calendar dates', () => {
  assert.equal(dateFolder(new Date(2024, 0, 9)), '2024-01-09');
});

test('scans nested media and ignores unsupported files', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'DCIM', '100APPLE'), { recursive: true });
  await fs.writeFile(path.join(root, 'DCIM', '100APPLE', 'IMG_1.JPG'), 'photo');
  await fs.writeFile(path.join(root, 'DCIM', '100APPLE', 'VID_1.MOV'), 'video');
  await fs.writeFile(path.join(root, 'DCIM', '100APPLE', 'notes.txt'), 'text');

  const { files, errors } = await scanMedia(root);
  assert.equal(errors.length, 0);
  assert.equal(files.length, 2);
  assert.deepEqual(new Set(files.map((file) => file.type)), new Set(['Photos', 'Videos']));
  assert.ok(files.every((file) => /^\d{4}-\d{2}-\d{2}$/.test(file.date)));
});

test('imports into type/date folders without overwriting duplicate names', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source');
  const destination = path.join(root, 'output');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'IMG_1.JPG'), 'first');
  const { files } = await scanMedia(source);

  const first = await importMedia({ source, destination, files });
  const second = await importMedia({ source, destination, files });
  assert.equal(first[0].ok, true);
  assert.equal(second[0].ok, true);
  assert.match(first[0].outputPath, new RegExp(`Photos[\\\\/]\\d{4}-\\d{2}-\\d{2}[\\\\/]IMG_1\\.JPG$`));
  assert.match(second[0].outputPath, /IMG_1 \(2\)\.JPG$/);
  assert.equal(await fs.readFile(first[0].outputPath, 'utf8'), 'first');
});

test('flat layout saves into the chosen folder without overwriting', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source');
  const destination = path.join(root, 'output');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'IMG_1.JPG'), 'photo');
  const { files } = await scanMedia(source);
  const request = { source, destination, files, layout: 'flat' };
  const first = await importMedia(request);
  const second = await importMedia(request);
  assert.equal(first[0].ok, true);
  assert.equal(second[0].ok, true);
  assert.deepEqual(await fs.readdir(destination), ['IMG_1 (2).JPG', 'IMG_1.JPG']);
  assert.equal(await fs.readFile(first[0].outputPath, 'utf8'), 'photo');
});

test('rejects media outside the chosen source folder', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source');
  const outside = path.join(root, 'outside.JPG');
  const destination = path.join(root, 'output');
  await fs.mkdir(source);
  await fs.writeFile(outside, 'do not import');

  const results = await importMedia({
    source,
    destination,
    files: [{
      sourcePath: outside,
      type: 'Photos',
      date: '2024-01-01'
    }]
  });
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /outside the chosen source folder/);
  await assert.rejects(fs.stat(destination));
});

test('rejects malformed import requests', async () => {
  await assert.rejects(importMedia({ files: [] }), /Choose a destination/);
  await assert.rejects(importMedia({ source: os.tmpdir(), destination: os.tmpdir(), files: [] }), /at least one media file/);
});

test('rejects a destination inside the source folder', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source');
  const destination = path.join(source, 'organized');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'IMG_1.JPG'), 'photo');
  const { files } = await scanMedia(source);
  await assert.rejects(
    importMedia({ source, destination, files }),
    /destination outside the source/
  );
  await assert.rejects(fs.stat(destination));
});

test('parallel analyzer and copier handle large batches and concurrent duplicate names', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'source');
  const destination = path.join(root, 'output');
  await fs.mkdir(path.join(source, 'A'), { recursive: true });
  await fs.mkdir(path.join(source, 'B'), { recursive: true });

  const writes = [];
  for (let i = 0; i < 40; i++) {
    const folder = i % 2 === 0 ? 'A' : 'B';
    const name = i < 4 ? 'DUP.JPG' : `IMG_${i}.JPG`;
    writes.push(fs.writeFile(path.join(source, folder, `${i < 4 ? (folder === 'A' ? 'DUP.JPG' : 'DUP.JPG') : name}`), `img-${i}`));
  }
  await Promise.all(writes);

  const { files, errors } = await scanMedia(source);
  assert.equal(errors.length, 0);
  assert.equal(files.length, 38);

  const results = await importMedia({ source, destination, files, layout: 'flat' });
  assert.equal(results.length, 38);
  assert.ok(results.every((r) => r.ok));
  const saved = await fs.readdir(destination);
  assert.equal(saved.length, 38);
});
