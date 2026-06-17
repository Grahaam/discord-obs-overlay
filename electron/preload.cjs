'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  completeSetup: (token, channelId) =>
    ipcRenderer.invoke('complete-setup', { token, channelId }),
  getPort: () => ipcRenderer.invoke('get-port'),
});
