'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { parentPort } = require('node:worker_threads');
const exifr = require('exifr');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff',
  '.gif', '.bmp', '.webp', '.dng', '.raw'
]);
const EXIF_DATE_FIELDS = [
  'DateTimeOriginal', 'CreateDate', 'MediaCreateDate',
  'TrackCreateDate', 'ModifyDate'
];
const EXIF_HEADER_BYTES = 65536;
const MAX_EXIF_FILE_SIZE = 64 * 1024 * 1024;
const WORKER_CONCURRENCY = 8;

function validDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return null;
}

function dateFolder(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function readHeader(filePath, size) {
  const length = Math.min(size, EXIF_HEADER_BYTES);
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function analyzeOne({ entryPath, name, type }) {
  const stats = await fs.stat(entryPath);
  let date = stats.mtime;
  let source = 'file date';

  if (IMAGE_EXTENSIONS.has(path.extname(entryPath).toLowerCase()) && stats.size <= MAX_EXIF_FILE_SIZE) {
    try {
      const bytes = await readHeader(entryPath, stats.size);
      const metadata = await exifr.parse(bytes, EXIF_DATE_FIELDS);
      const parsed = metadata && (
        validDate(metadata.DateTimeOriginal) ||
        validDate(metadata.MediaCreateDate) ||
        validDate(metadata.TrackCreateDate) ||
        validDate(metadata.CreateDate) ||
        validDate(metadata.ModifyDate)
      );
      if (parsed) {
        date = parsed;
        source = 'metadata';
      }
    } catch {
      // Fallback to file timestamp when embedded metadata is unreadable.
    }
  }

  return {
    id: entryPath,
    name,
    sourcePath: entryPath,
    type,
    date: dateFolder(date),
    dateSource: source,
    size: stats.size
  };
}

async function analyzeBatch(entries) {
  const results = [];
  const errors = [];
  let index = 0;
  const count = Math.min(WORKER_CONCURRENCY, entries.length);
  const runners = Array.from({ length: count }, async () => {
    while (index < entries.length) {
      const item = entries[index++];
      try {
        results.push(await analyzeOne(item));
      } catch (error) {
        errors.push({ path: item.entryPath, message: error.message });
      }
    }
  });
  await Promise.all(runners);
  return { results, errors };
}

if (parentPort) {
  parentPort.on('message', (message) => {
    analyzeBatch(message.entries)
      .then((payload) => parentPort.postMessage({ id: message.id, ok: true, ...payload }))
      .catch((error) => parentPort.postMessage({ id: message.id, ok: false, error: error.message }));
  });
}

module.exports = { analyzeOne, analyzeBatch };
