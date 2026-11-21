const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aplet', {
  scanPhone: () => ipcRenderer.invoke('scan-phone'),
  importPhone: (request) => ipcRenderer.invoke('import-phone', request),
  onPhoneProgress: (callback) => ipcRenderer.on('phone-progress', (_event, data) => callback(data)),
  chooseFolder: (title) => ipcRenderer.invoke('choose-folder', title),
  scanMedia: (source) => ipcRenderer.invoke('scan-media', source),
  importMedia: (request) => ipcRenderer.invoke('import-media', request),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  detectAppleDevice: () => ipcRenderer.invoke('detect-apple-device')
});
