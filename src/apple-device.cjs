const { execFile } = require('node:child_process');

const DEVICE_QUERY = [
  '$ErrorActionPreference = "Stop"',
  '$devices = Get-PnpDevice -PresentOnly | Where-Object {',
  '  ($_.FriendlyName -match "(?i)\\biPhone\\b|Apple Mobile Device USB" -or $_.InstanceId -match "(?i)VID_05AC")',
  '}',
  'if ($null -eq $devices) { "[]" }',
  'else { $devices | Select-Object FriendlyName, Status | ConvertTo-Json -Compress }'
].join('\n');

function parseDeviceOutput(output) {
  const text = String(output || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => row && typeof row.FriendlyName === 'string')
    .map((row) => ({
      name: row.FriendlyName,
      status: typeof row.Status === 'string' ? row.Status : 'Unknown'
    }));
}

function detectAppleDevices() {
  if (process.platform !== 'win32') {
    return Promise.resolve({ supported: false, devices: [] });
  }
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', DEVICE_QUERY],
      { windowsHide: true, timeout: 10000, maxBuffer: 128 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          resolve({ supported: true, error: 'Windows could not check connected devices.', devices: [] });
          return;
        }
        try {
          resolve({ supported: true, devices: parseDeviceOutput(stdout) });
        } catch {
          resolve({ supported: true, error: 'Windows returned an unreadable device list.', devices: [] });
        }
      }
    );
  });
}

module.exports = { detectAppleDevices, parseDeviceOutput };
