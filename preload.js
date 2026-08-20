// preload.js - Puente seguro IPC para Loquendo Studio
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Control de ventana
  closeApp: () => ipcRenderer.send('app-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),

  // Eventos del sistema
  onBeforeQuit: (callback) => ipcRenderer.on('before-quit', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});