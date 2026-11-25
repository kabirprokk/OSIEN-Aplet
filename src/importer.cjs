'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { analyzeMediaParallel } = require('./parallel-analyzer.cjs');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff',
  '.gif', '.bmp', '.webp', '.dng', '.raw'
]);
const VIDEO_EXTENSIONS = new Set([
  '.mov', '.mp4', '.m4v', '.3gp', '.avi', '.mkv'
]);

function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'Photos';
  if (VIDEO_EXTENSIONS.has(ext)) return 'Videos';
  return null;
}

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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function realpathWithMissing(target) {
  let current = path.resolve(target);
  const missingParts = [];
  while (true) {
    try {
      const existing = await fs.realpath(current);
      return path.join(existing, ...missingParts.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missingParts.push(path.basename(current));
      current = parent;
    }
  }
}

const SCAN_CONCURRENCY = 24;
const COPY_CONCURRENCY = 6;

async function runWithConcurrency(items, limit, worker) {
  let index = 0;
  const count = Math.min(limit, items.length);
  const runners = Array.from({ length: count }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

async function walk(directory, results, errors) {
  const dirs = [directory];
  const mediaEntries = [];

  while (dirs.length) {
    const batch = dirs.splice(0, SCAN_CONCURRENCY);
    await Promise.all(batch.map(async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        errors.push({ path: dir, message: error.message });
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          dirs.push(entryPath);
        } else if (entry.isFile()) {
          const type = classify(entryPath);
          if (type) mediaEntries.push({ entryPath, name: entry.name, type });
        }
      }
    }));
  }

  const analyzed = await analyzeMediaParallel(mediaEntries);
  results.push(...analyzed.results);
  errors.push(...analyzed.errors);
}

async function scanMedia(source) {
  if (typeof source !== 'string' || !path.isAbsolute(source)) {
    throw new Error('Choose a valid source folder.');
  }
  const root = await fs.realpath(source);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) throw new Error('The source must be a folder.');
  const files = [];
  const errors = [];
  await walk(root, files, errors);
  files.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  return { files, errors };
}

async function unusedDestination(directory, name, reserved) {
  const extension = path.extname(name);
  const stem = path.basename(name, extension);
  let candidate = path.join(directory, name);
  let suffix = 2;
  while (true) {
    const key = candidate.toLowerCase();
    if (reserved) {
      if (reserved.has(key)) {
        candidate = path.join(directory, `${stem} (${suffix++})${extension}`);
        continue;
      }
      reserved.add(key);
    }
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${stem} (${suffix++})${extension}`);
    } catch (error) {
      if (error.code === 'ENOENT') return candidate;
      if (reserved) reserved.delete(key);
      throw error;
    }
  }
}

async function copyOne(file, destinationRoot, layout = 'organized', reserved = null) {
  if (!file || typeof file.sourcePath !== 'string' || !path.isAbsolute(file.sourcePath)) {
    throw new Error('Invalid source file.');
  }
  const type = classify(file.sourcePath);
  if (!type || type !== file.type) throw new Error('Unsupported media file.');
  if (file.date !== 'Unknown-date' && !/^\d{4}-\d{2}-\d{2}$/.test(file.date)) throw new Error('Invalid media date.');

  const folder = layout === 'flat' ? destinationRoot : path.join(destinationRoot, type, file.date);
  await fs.mkdir(folder, { recursive: true });
  const target = await unusedDestination(folder, path.basename(file.sourcePath), reserved);
  await fs.copyFile(file.sourcePath, target, constants.COPYFILE_EXCL);
  return target;
}

async function importMedia(request, progress = () => {}) {
  if (!request || typeof request.destination !== 'string' ||
      !path.isAbsolute(request.destination) || typeof request.source !== 'string' ||
      !path.isAbsolute(request.source) || !Array.isArray(request.files) || !request.files.length) {
    throw new Error('Choose a destination and at least one media file.');
  }
  const layout = request.layout || 'organized';
  if (layout !== 'flat' && layout !== 'organized') throw new Error('Invalid save layout.');
  const source = await fs.realpath(request.source);
  const results = [];
  const validFiles = [];
  for (const file of request.files) {
    try {
      const actualSource = await fs.realpath(file.sourcePath);
      const relative = path.relative(source, actualSource);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('The selected file is outside the chosen source folder.');
      }
      validFiles.push({ ...file, sourcePath: actualSource });
    } catch (error) {
      results.push({ ok: false, name: file && path.basename(file.sourcePath || ''), error: error.message });
    }
  }
  if (!validFiles.length) return results;
  const destinationPath = await realpathWithMissing(request.destination);
  if (isWithin(source, destinationPath)) {
    throw new Error('Choose a destination outside the source folder.');
  }
  await fs.mkdir(destinationPath, { recursive: true });
  const destination = await fs.realpath(destinationPath);
  if (isWithin(source, destination)) {
    throw new Error('Choose a destination outside the source folder.');
  }
  const reserved = new Set();
  await runWithConcurrency(validFiles, COPY_CONCURRENCY, async (file) => {
    try {
      const outputPath = await copyOne(file, destination, layout, reserved);
      results.push({ ok: true, name: path.basename(file.sourcePath), outputPath, type: file.type });
    } catch (error) {
      results.push({ ok: false, name: file && path.basename(file.sourcePath || ''), error: error.message });
    }
    progress({ completed: results.length, total: request.files.length });
  });
  return results;
}

module.exports = { classify, dateFolder, scanMedia, importMedia };
