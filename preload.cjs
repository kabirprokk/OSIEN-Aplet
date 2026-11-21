const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aplet', {
  windowAction: (action) => ipcRenderer.send('window-action', action),
  scanPhone: () => ipcRenderer.invoke('scan-phone'),
  onScanProgress: (callback) => subscribe('scan-progress', callback),
  onLocalProgress: (callback) => subscribe('local-progress', callback),
  importPhone: (request) => ipcRenderer.invoke('import-phone', request),
  onPhoneProgress: (callback) => subscribe('phone-progress', callback),
  chooseFolder: (title) => ipcRenderer.invoke('choose-folder', title),
  scanMedia: (source) => ipcRenderer.invoke('scan-media', source),
  importMedia: (request) => ipcRenderer.invoke('import-media', request),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  detectAppleDevice: () => ipcRenderer.invoke('detect-apple-device')
});
