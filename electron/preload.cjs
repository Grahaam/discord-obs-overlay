'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Setup wizard (only accepted from the wizard window, see main.cjs).
  setupToken: (token) => ipcRenderer.invoke('setup-token', { token }),
  listChannels: () => ipcRenderer.invoke('list-channels'),
  setupChannel: (channelId) => ipcRenderer.invoke('setup-channel', { channelId }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getPort: () => ipcRenderer.invoke('get-port'),
  // Opens DATA_DIR/user-assets in Explorer / Finder. The renderer cannot touch
  // the filesystem itself (contextIsolation), so main does it via shell.openPath.
  openUserAssets: () => ipcRenderer.invoke('open-user-assets'),
});
