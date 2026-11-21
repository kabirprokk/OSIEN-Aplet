const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { scanMedia, importMedia } = require('./src/importer.cjs');

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    title: 'OSIEN-Aplet',
    backgroundColor: '#f5f7f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('choose-folder', async (_event, title) => {
  const result = await dialog.showOpenDialog({
    title,
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('scan-media', async (_event, source) => scanMedia(source));
ipcMain.handle('import-media', async (_event, request) => importMedia(request));
ipcMain.handle('open-folder', async (_event, folder) => {
  const error = await shell.openPath(folder);
  return error || null;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
