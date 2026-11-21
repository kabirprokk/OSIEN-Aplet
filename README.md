# OSIEN-Aplet

OSIEN-Aplet is a local-first Windows desktop app for selecting accessible iPhone media, reviewing it, and copying it into date/type folders.

## What it does

- Scans a selected folder for common photo and video formats.
- Uses embedded capture dates when readable; otherwise uses the file's modified date.
- Previews the file list, filters by photo/video, searches, and supports selection.
- Copies selected files without overwriting existing files.
- Organizes output as `Photos/YYYY-MM-DD/` and `Videos/YYYY-MM-DD/`.
- Keeps file data on the PC; no accounts, telemetry, or cloud upload.

## iPhone access notes

Connect and unlock the iPhone, accept **Trust This Computer**, and use Apple's Windows device support. Choose the iPhone's DCIM/media folder only if Windows exposes it in the folder picker. Some Windows versions expose iPhone media as a portable-device namespace rather than a normal folder; this first release does not implement Microsoft's WPD COM interface and cannot browse that namespace itself. If the folder is not selectable, import from a folder Windows has copied/exported the media to. No third-party driver is installed or replaced.

Date fallback can be inaccurate when the source file timestamp changed during transfer. The app labels whether its date came from metadata or the file timestamp.

## Development

Requires Node.js 20+ and npm.

```powershell
npm install
npm test
npm start
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
