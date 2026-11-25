'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { classify } = require('./importer.cjs');

let iosDeviceModule = null;
function getIosDevice() {
  if (!iosDeviceModule) {
    iosDeviceModule = require('appium-ios-device');
  }
  return iosDeviceModule;
}

const FOLDER_DATE_REGEX = /^((?:19|20)\d{2})(0[1-9]|1[0-2])/;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('AFC timeout')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

async function getAfcUdid() {
  try {
    const { utilities } = getIosDevice();
    const devices = await withTimeout(utilities.getConnectedDevices(), 2000);
    if (!Array.isArray(devices) || devices.length === 0) return null;
    if (devices.length > 1) throw new Error('Connect only one iPhone, then try again.');
    return devices[0];
  } catch (error) {
    if (error && /Connect only one iPhone/.test(error.message)) throw error;
    return null;
  }
}

async function afcScan(progress = () => {}) {
  const udid = await getAfcUdid();
  if (!udid) return null;

  const { services, utilities } = getIosDevice();
  const started = Date.now();
  let deviceName = 'Apple iPhone';
  try {
    const name = await withTimeout(utilities.getDeviceName(udid), 1500);
    if (name) deviceName = name;
  } catch {
    // Keep default device name.
  }

  const afc = await services.startAfcService(udid);
  const errors = [];
  let found = 0;
  let batch = [];
  let lastPublish = started;

  const flush = () => {
    if (!batch.length) return;
    const now = Date.now();
    progress({
      progress: true,
      found,
      elapsedMs: now - started,
      items: batch
    });
    batch = [];
    lastPublish = now;
  };

  try {
    let dcimEntries;
    try {
      dcimEntries = await afc.listDirectory('/DCIM');
    } catch {
      return null;
    }

    const queue = [];
    for (const entry of dcimEntries) {
      if (entry === '.' || entry === '..') continue;
      const fullPath = `/DCIM/${entry}`;
      const mediaType = classify(entry);
      if (mediaType) {
        batch.push({
          name: entry,
          segments: { afc: true, udid, path: fullPath },
          type: mediaType,
          date: 'Unknown-date',
          dateSource: 'on import',
          size: 0
        });
        found++;
      } else {
        queue.push({ dir: fullPath, name: entry });
      }
    }

    for (const { dir, name } of queue) {
      let entries;
      try {
        entries = await afc.listDirectory(dir);
      } catch (error) {
        errors.push(`${dir}: ${error.message}`);
        continue;
      }
      const fm = FOLDER_DATE_REGEX.exec(name);
      const folderDay = fm ? `${fm[1]}-${fm[2]}-01` : 'Unknown-date';
      const folderDateSource = fm ? 'folder month' : 'on import';

      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue;
        const type = classify(entry);
        if (!type) continue;
        batch.push({
          name: entry,
          segments: { afc: true, udid, path: `${dir}/${entry}` },
          type,
          date: folderDay,
          dateSource: folderDateSource,
          size: 0
        });
        found++;
        const threshold = found <= 40 ? 20 : 300;
        if (batch.length >= threshold || Date.now() - lastPublish >= 150) {
          flush();
        }
      }
    }

    flush();
    return { count: found, errors, device: `${deviceName} (AFC Turbo)` };
  } finally {
    try { afc.close(); } catch { /* ignore */ }
  }
}

async function createAfcCopySession(udid) {
  const { services } = getIosDevice();
  const afc = await services.startAfcService(udid);
  return {
    async copy(request, progress = () => {}) {
      const remotePath = request.segments.path;
      const filename = path.basename(remotePath);
      const target = path.join(request.destination, filename);
      let totalBytes = 0;
      try {
        const info = await afc.getFileInfo(remotePath);
        totalBytes = Number(info && info.st_size) || 0;
      } catch {
        // Fallback to unknown total size.
      }
      const readStream = await afc.createReadStream(remotePath, { autoDestroy: true });
      const writeStream = fs.createWriteStream(target, { flags: 'wx' });
      let bytes = 0;
      let lastReport = 0;

      return new Promise((resolve, reject) => {
        const fail = (err) => {
          readStream.destroy();
          writeStream.destroy();
          reject(err);
        };
        readStream.on('data', (chunk) => {
          bytes += chunk.length;
          const now = Date.now();
          if (now - lastReport >= 100 || (totalBytes > 0 && bytes >= totalBytes)) {
            lastReport = now;
            progress({ progress: true, bytes, totalBytes: totalBytes || bytes });
          }
        });
        readStream.on('error', fail);
        writeStream.on('error', fail);
        writeStream.on('finish', () => {
          progress({ progress: true, bytes, totalBytes: totalBytes || bytes });
          resolve({ path: target, size: bytes });
        });
        readStream.pipe(writeStream);
      });
    },
    async close() {
      try { afc.close(); } catch { /* ignore */ }
    }
  };
}

module.exports = { afcScan, createAfcCopySession };
