const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const { scanMedia, importMedia } = require('./src/importer.cjs');
const { detectAppleDevices } = require('./src/apple-device.cjs');
const { PhoneReader } = require('./src/phone.cjs');
const phone = new PhoneReader();
const destinations = new Set();

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 680,
    title: 'OSIEN Memories',
    backgroundColor: '#101214',
    icon: path.join(__dirname, 'src', 'assets', 'osien-logo.png'),
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'app-dist', 'index.html'));
}

ipcMain.handle('choose-folder', async (_event, title) => {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled) return null;
  destinations.add(result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle('scan-media', async (_event, source) => scanMedia(source));
ipcMain.handle('import-media', (event, request) => importMedia(request, progress => {
  if (!event.sender.isDestroyed()) event.sender.send('local-progress', progress);
}));
ipcMain.handle('detect-apple-device', () => detectAppleDevices());
ipcMain.handle('scan-phone', event => phone.scan(progress => {
  if (!event.sender.isDestroyed()) event.sender.send('scan-progress', progress);
}));
ipcMain.handle('import-phone', (event, request) => {
  if (!destinations.has(request.destination)) throw new Error('Choose a destination first.');
  return phone.import(request.ids, request.destination, progress => {
    if (!event.sender.isDestroyed()) event.sender.send('phone-progress', progress);
  });
});
ipcMain.handle('open-folder', async (_event, folder) => {
  const error = await shell.openPath(folder);
  return error || null;
});
ipcMain.on('window-action', (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (action === 'minimize') window.minimize();
  else if (action === 'toggle-maximize') {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else if (action === 'close') window.close();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
