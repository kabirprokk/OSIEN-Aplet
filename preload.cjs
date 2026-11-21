const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aplet', {
  chooseFolder: (title) => ipcRenderer.invoke('choose-folder', title),
  scanMedia: (source) => ipcRenderer.invoke('scan-media', source),
  importMedia: (request) => ipcRenderer.invoke('import-media', request),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  detectAppleDevice: () => ipcRenderer.invoke('detect-apple-device')
});
