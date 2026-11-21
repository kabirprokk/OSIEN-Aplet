const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aplet', {
  windowAction: (action) => ipcRenderer.send('window-action', action),
  scanPhone: () => ipcRenderer.invoke('scan-phone'),
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', (_event, data) => callback(data)),
  onLocalProgress: (callback) => ipcRenderer.on('local-progress', (_event, data) => callback(data)),
  importPhone: (request) => ipcRenderer.invoke('import-phone', request),
  onPhoneProgress: (callback) => ipcRenderer.on('phone-progress', (_event, data) => callback(data)),
  chooseFolder: (title) => ipcRenderer.invoke('choose-folder', title),
  scanMedia: (source) => ipcRenderer.invoke('scan-media', source),
  importMedia: (request) => ipcRenderer.invoke('import-media', request),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  detectAppleDevice: () => ipcRenderer.invoke('detect-apple-device')
});
