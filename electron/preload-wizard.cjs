'use strict';
// Sandboxed preload: only contextBridge / ipcRenderer are available here.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Only accepted from the wizard window, see main.cjs.
  setupToken: (token, language) => ipcRenderer.invoke('setup-token', { token, language }),
  listChannels: () => ipcRenderer.invoke('list-channels'),
  setupChannel: (channelId, language) => ipcRenderer.invoke('setup-channel', { channelId, language }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
