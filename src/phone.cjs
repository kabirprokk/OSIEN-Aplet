const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { importMedia } = require('./importer.cjs');

function phoneOperation(request, progress = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), 'phone.ps1')],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '', pending = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => {
      pending += data;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch {
          output += line;
          continue;
        }
        if (parsed.progress === true) progress(parsed);
        else output += line;
      }
    });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(errors.trim() || 'iPhone operation failed.'));
      try { resolve(JSON.parse((output + pending).replace(/^\uFEFF/, ''))); } catch {
        reject(new Error('Invalid response from Windows phone storage.'));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

function createPhoneCopySession() {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), 'phone.ps1'), '-Session'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = '', errors = '', active = null, ready = false, closed = false;
    let finishClose;
    const closePromise = new Promise(done => { finishClose = done; });
    const startupTimer = setTimeout(() => {
      if (!ready) {
        child.kill();
        reject(new Error('Windows took too long to open iPhone storage.'));
      }
    }, 30000);
    const session = {
      copy(request, progress = () => {}) {
        if (closed) return Promise.reject(new Error('The iPhone copy session closed.'));
        if (active) return Promise.reject(new Error('Wait for the current phone copy.'));
        return new Promise((done, fail) => {
          active = { resolve: done, reject: fail, progress };
          child.stdin.write(`${JSON.stringify(request)}\n`, error => {
            if (error && active) { active.reject(error); active = null; }
          });
        });
      },
      async close() {
        if (!closed) child.stdin.end();
        await closePromise;
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => { errors += data; });
    child.stdout.on('data', data => {
      pending += data;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { errors += line; continue; }
        if (message.ready) {
          ready = true;
          clearTimeout(startupTimer);
          resolve(session);
        } else if (message.progress && active) {
          active.progress(message);
        } else if (message.result && active) {
          active.resolve({ path: message.path, size: message.size });
          active = null;
        } else if (message.error && active) {
          active.reject(new Error(message.message || 'iPhone copy failed.'));
          active = null;
        }
      }
    });
    child.on('error', error => {
      clearTimeout(startupTimer);
      if (!ready) reject(error);
      if (active) { active.reject(error); active = null; }
    });
    child.on('close', code => {
      closed = true;
      clearTimeout(startupTimer);
      const error = new Error(errors.trim() || `iPhone copy session ended (${code}).`);
      if (!ready) reject(error);
      if (active) { active.reject(error); active = null; }
      finishClose();
    });
  });
}

class PhoneReader {
  constructor(operation = phoneOperation) {
    this.operation = operation;
    this.files = new Map();
    this.busy = false;
  }

  async scan(progress = () => {}) {
    if (this.busy) throw new Error('Wait for the current phone operation.');
    this.busy = true;
    this.files.clear();
    try {
      const idsByPath = new Map();
      const idFor = file => {
        const key = JSON.stringify(file.segments);
        if (!idsByPath.has(key)) idsByPath.set(key, randomUUID());
        return idsByPath.get(key);
      };
      const result = await this.operation({ action: 'scan' }, event => {
        const discovered = (event.items || []).map(file => {
          const id = idFor(file);
          const stored = { ...file, id };
          this.files.set(id, stored);
          const { segments, ...publicFile } = stored;
          return publicFile;
        });
        progress({ ...event, files: discovered });
      });
      // The Windows helper streams batches instead of serializing the entire
      // library a second time in its final response. Keep compatibility with
      // helpers that return a file list without progress events.
      if (Array.isArray(result.files)) {
        for (const file of result.files) {
          const id = idFor(file);
          this.files.set(id, { ...file, id });
        }
      }
      return { ...result, files: [...this.files.values()].map(({ segments, ...file }) => file) };
    } finally { this.busy = false; }
  }

  async import(ids, destination, progress = () => {}, layout = 'organized') {
    if (this.busy) throw new Error('Wait for the current phone operation.');
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !this.files.has(id))) {
      throw new Error('Read the iPhone again before importing.');
    }
    this.busy = true;
    const results = [];
    const selected = [...new Set(ids)];
    let completedBytes = 0;
    let session;
    try {
      if (this.operation === phoneOperation && selected.length > 1) {
        session = await createPhoneCopySession();
      }
      for (const id of selected) {
        const file = this.files.get(id);
        progress({ phase: 'transfer', name: file.name, completed: results.length,
          total: selected.length, bytes: completedBytes, currentBytes: 0,
          currentTotalBytes: file.size || 0 });
        let staging;
        try {
          staging = await fs.mkdtemp(path.join(destination, '.aplet-transfer-'));
          const copied = await (session ? session.copy.bind(session) : this.operation)({
            action: 'copy', segments: file.segments, size: file.size, destination: staging
          }, update => progress({
            phase: 'transfer', name: file.name, completed: results.length,
            total: selected.length,
            bytes: completedBytes + Math.max(0, update.bytes || 0),
            currentBytes: Math.max(0, update.bytes || 0),
            currentTotalBytes: Math.max(0, update.totalBytes || file.size || 0)
          }));
          file.size = copied.size;
          progress({ phase: 'saving', name: file.name, completed: results.length,
            total: selected.length, bytes: completedBytes + file.size,
            currentBytes: file.size, currentTotalBytes: file.size });
          const imported = await importMedia({
            source: staging, destination, layout,
            files: [{ ...file, sourcePath: copied.path }]
          });
          if (!imported[0]?.ok) throw new Error(imported[0]?.error || 'Could not organize the copied file.');
          const saved = await fs.stat(imported[0].outputPath);
          if (!saved.isFile() || saved.size !== copied.size) {
            throw new Error('The saved file could not be verified. Check the destination before retrying.');
          }
          await fs.rm(staging, { recursive: true });
          results.push({ ...imported[0], id });
          completedBytes += file.size;
          progress({ phase: 'saved', name: file.name, completed: results.length,
            total: selected.length, bytes: completedBytes,
            currentBytes: file.size, currentTotalBytes: file.size });
        } catch (error) {
          results.push({ id, name: file.name, ok: false,
            error: `${error.message}${staging ? ` Staging: ${staging}` : ''}` });
          break; // A disconnected phone must not cause repeated unattended transfers.
        }
      }
      return results;
    } finally {
      if (session) await session.close();
      this.busy = false;
    }
  }
}
module.exports = { PhoneReader, phoneOperation, createPhoneCopySession };
