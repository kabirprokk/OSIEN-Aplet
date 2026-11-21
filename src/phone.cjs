const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { importMedia } = require('./importer.cjs');

function phoneOperation(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows',
      'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), 'phone.ps1')],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(errors.trim() || 'iPhone operation failed.'));
      try { resolve(JSON.parse(output.replace(/^\uFEFF/, ''))); } catch {
        reject(new Error('Invalid response from Windows phone storage.'));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

class PhoneReader {
  constructor(operation = phoneOperation) {
    this.operation = operation;
    this.files = new Map();
    this.busy = false;
  }

  async scan() {
    if (this.busy) throw new Error('Wait for the current phone operation.');
    this.busy = true;
    this.files.clear();
    try {
      const result = await this.operation({ action: 'scan' });
      const files = result.files.map(file => ({ ...file, id: randomUUID() }));
      for (const file of files) this.files.set(file.id, file);
      return { ...result, files: files.map(({ segments, ...file }) => file) };
    } finally { this.busy = false; }
  }

  async import(ids, destination, progress = () => {}) {
    if (this.busy) throw new Error('Wait for the current phone operation.');
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !this.files.has(id))) {
      throw new Error('Read the iPhone again before importing.');
    }
    this.busy = true;
    const results = [];
    try {
      for (const id of new Set(ids)) {
        const file = this.files.get(id);
        progress({ name: file.name, completed: results.length, total: ids.length });
        let staging;
        try {
          staging = await fs.mkdtemp(path.join(destination, '.aplet-transfer-'));
          const copied = await this.operation({
            action: 'copy', segments: file.segments, size: file.size, destination: staging
          });
          const imported = await importMedia({
            source: staging, destination,
            files: [{ ...file, sourcePath: copied.path }]
          });
          if (!imported[0]?.ok) throw new Error(imported[0]?.error || 'Could not organize the copied file.');
          await fs.rm(staging, { recursive: true });
          results.push({ ...imported[0], id });
        } catch (error) {
          results.push({ id, name: file.name, ok: false,
            error: `${error.message}${staging ? ` Staging: ${staging}` : ''}` });
          break; // A disconnected phone must not cause repeated unattended transfers.
        }
      }
      return results;
    } finally { this.busy = false; }
  }
}
module.exports = { PhoneReader, phoneOperation };
