const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeviceOutput } = require('../src/apple-device.cjs');

test('parses an empty Windows device list', () => {
  assert.deepEqual(parseDeviceOutput('[]'), []);
  assert.deepEqual(parseDeviceOutput(''), []);
});

test('parses a single Apple device returned by PowerShell', () => {
  assert.deepEqual(
    parseDeviceOutput('{"FriendlyName":"Apple iPhone","Status":"OK"}'),
    [{ name: 'Apple iPhone', status: 'OK' }]
  );
});

test('recognizes the Apple Mobile Device USB driver name', () => {
  assert.deepEqual(
    parseDeviceOutput('{"FriendlyName":"Apple Mobile Device USB Composite Device","Status":"OK"}'),
    [{ name: 'Apple Mobile Device USB Composite Device', status: 'OK' }]
  );
});

test('parses multiple detected devices and ignores malformed entries', () => {
  assert.deepEqual(
    parseDeviceOutput('[{"FriendlyName":"Apple iPhone","Status":"OK"},{"Status":"Unknown"}]'),
    [{ name: 'Apple iPhone', status: 'OK' }]
  );
});

test('rejects malformed PowerShell output', () => {
  assert.throws(() => parseDeviceOutput('not-json'), SyntaxError);
});
