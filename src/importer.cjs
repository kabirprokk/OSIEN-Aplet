const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const exifr = require('exifr');

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

async function mediaDate(filePath, stats) {
  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || stats.size > 64 * 1024 * 1024) {
    return { date: stats.mtime, source: 'file date' };
  }
  try {
    const bytes = await fs.readFile(filePath);
    const metadata = await exifr.parse(bytes, [
      'DateTimeOriginal', 'CreateDate', 'MediaCreateDate',
      'TrackCreateDate', 'ModifyDate'
    ]);
    const date = metadata && (
      validDate(metadata.DateTimeOriginal) ||
      validDate(metadata.MediaCreateDate) ||
      validDate(metadata.TrackCreateDate) ||
      validDate(metadata.CreateDate) ||
      validDate(metadata.ModifyDate)
    );
    if (date) return { date, source: 'metadata' };
  } catch {
    // Some formats have no readable embedded date; use the file timestamp.
  }
  return { date: stats.mtime, source: 'file date' };
}

async function walk(directory, results, errors) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push({ path: directory, message: error.message });
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(entryPath, results, errors);
    } else if (entry.isFile() && classify(entryPath)) {
      try {
        const stats = await fs.stat(entryPath);
        const { date, source } = await mediaDate(entryPath, stats);
        results.push({
          id: entryPath,
          name: entry.name,
          sourcePath: entryPath,
          type: classify(entryPath),
          date: dateFolder(date),
          dateSource: source,
          size: stats.size
        });
      } catch (error) {
        errors.push({ path: entryPath, message: error.message });
      }
    }
  }
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

async function unusedDestination(directory, name) {
  const extension = path.extname(name);
  const stem = path.basename(name, extension);
  let candidate = path.join(directory, name);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(directory, `${stem} (${suffix++})${extension}`);
    } catch (error) {
      if (error.code === 'ENOENT') return candidate;
      throw error;
    }
  }
}

async function copyOne(file, destinationRoot) {
  if (!file || typeof file.sourcePath !== 'string' || !path.isAbsolute(file.sourcePath)) {
    throw new Error('Invalid source file.');
  }
  const type = classify(file.sourcePath);
  if (!type || type !== file.type) throw new Error('Unsupported media file.');
  if (file.date !== 'Unknown-date' && !/^\d{4}-\d{2}-\d{2}$/.test(file.date)) throw new Error('Invalid media date.');

  const folder = path.join(destinationRoot, type, file.date);
  await fs.mkdir(folder, { recursive: true });
  const target = await unusedDestination(folder, path.basename(file.sourcePath));
  await fs.copyFile(file.sourcePath, target, constants.COPYFILE_EXCL);
  return target;
}

async function importMedia(request, progress = () => {}) {
  if (!request || typeof request.destination !== 'string' ||
      !path.isAbsolute(request.destination) || typeof request.source !== 'string' ||
      !path.isAbsolute(request.source) || !Array.isArray(request.files)) {
    throw new Error('Choose a destination and at least one media file.');
  }
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
  for (const file of validFiles) {
    try {
      const outputPath = await copyOne(file, destination);
      results.push({ ok: true, name: path.basename(file.sourcePath), outputPath });
    } catch (error) {
      results.push({ ok: false, name: file && path.basename(file.sourcePath || ''), error: error.message });
    }
    progress({ completed: results.length, total: request.files.length });
  }
  return results;
}

module.exports = { classify, dateFolder, scanMedia, importMedia };
