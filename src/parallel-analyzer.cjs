'use strict';

const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { analyzeBatch } = require('./analyzer-worker.cjs');

const WORKER_SCRIPT = path.join(__dirname, 'analyzer-worker.cjs');
const PARALLEL_THRESHOLD = 32;

function workerCountFor(itemCount) {
  const cpuCount = Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1);
  return Math.min(cpuCount, 6, Math.max(1, Math.ceil(itemCount / 16)));
}

function runWorkerChunk(entries) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT);
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      worker.terminate().catch((err) => {
        if (err) console.warn('Analyzer worker termination warning:', err.message);
      });
      fn(value);
    };
    worker.on('message', (msg) => {
      if (msg.ok) finish(resolve, { results: msg.results, errors: msg.errors });
      else finish(reject, new Error(msg.error || 'Analyzer worker failed.'));
    });
    worker.on('error', (error) => finish(reject, error));
    worker.on('exit', (code) => {
      if (!settled && code !== 0) finish(reject, new Error(`Analyzer worker exited with code ${code}.`));
    });
    worker.postMessage({ id: 1, entries });
  });
}

async function analyzeMediaParallel(entries) {
  if (!entries.length) return { results: [], errors: [] };
  if (entries.length < PARALLEL_THRESHOLD) {
    return analyzeBatch(entries);
  }

  const workers = workerCountFor(entries.length);
  if (workers <= 1) {
    return analyzeBatch(entries);
  }

  const chunkSize = Math.ceil(entries.length / workers);
  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }

  const outputs = await Promise.all(chunks.map(runWorkerChunk));
  const results = [];
  const errors = [];
  for (const out of outputs) {
    results.push(...out.results);
    errors.push(...out.errors);
  }
  return { results, errors };
}

module.exports = { analyzeMediaParallel };
