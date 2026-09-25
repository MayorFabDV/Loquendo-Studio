// preload.js - Puente seguro entre el renderer y el main (contextIsolation ON)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: (url) => ipcRenderer.send('abrir-enlace-externo', url)
});