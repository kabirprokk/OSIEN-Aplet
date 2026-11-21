# OSIEN-Aplet

OSIEN-Aplet is a local-first Windows desktop app for selecting accessible iPhone media, reviewing it, and copying it into date/type folders.

## What it does

- Scans a selected folder for common photo and video formats.
- Uses embedded capture dates when readable; otherwise uses the file's modified date.
- Previews the file list, filters by photo/video, searches, and supports selection.
- Groups files by date and supports selecting visible files or one date group.
- Shows live discovered-file count and scan rate; avoids probing every file size during a scan, then shows the current file's actual byte progress and cumulative bytes written during import.
- Groups media by capture date, with per-day selection, Select all, and Clear selection.
- Copies selected files without overwriting existing files.
- Organizes output as `Photos/YYYY-MM-DD/` and `Videos/YYYY-MM-DD/`.
- Checks whether Windows reports a connected Apple iPhone in its Plug and Play device list.
- Uses a custom frameless window, React, Radix UI checkboxes, Lucide icons, and a remembered dark/light appearance toggle.
- Uses the supplied OSIEN logo and black/cyan/lavender brand palette.
- Keeps file data on the PC; no accounts, telemetry, or cloud upload.

## iPhone access notes

Connect and unlock the iPhone, accept **Trust This Computer**, then click **Read iPhone**. The app enumerates Windows' portable-device Shell namespace directly, including Internal Storage. Select media, choose a local destination, and click **Import selected**. Keep the phone unlocked and connected. Only media exposed by Windows is available; iCloud-only originals must be downloaded onto the phone first. Connect one iPhone at a time.

Transfers use Windows Shell's portable-device copy into a unique staging folder. The app checks the resulting size and exclusive read access before organizing the copy. Interrupted transfers retain staging files and stop the batch; failures remain selected. Originals are never deleted. No third-party driver is installed or replaced.

The connection indicator reports Windows Plug and Play status. **Read iPhone** tests actual storage access. Scanning large libraries can take several minutes. Device-reported capture/encoded dates are preferred; missing dates use the device file date, or `Unknown-date` when none is supplied.

Date fallback can be inaccurate when the source file timestamp changed during transfer. The app labels whether its date came from metadata or the file timestamp.

## Development

Requires Node.js 20.19+ (or 22.12+) and npm.

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

Build an x64 Windows installer:

```powershell
npm run dist
```

The installer is written to `release/`.

## Privacy and safety

The app runs without Node integration in the renderer, uses a context-isolated preload bridge, and only requests folder access when the user selects one. It copies; it does not delete or alter source media.

## License

MIT. This project is an independent implementation and does not include or derive from 3uTools code or assets.
