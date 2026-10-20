'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Setup wizard (only accepted from the wizard window, see main.cjs).
  setupToken: (token, language) => ipcRenderer.invoke('setup-token', { token, language }),
  listChannels: () => ipcRenderer.invoke('list-channels'),
  setupChannel: (channelId, language) => ipcRenderer.invoke('setup-channel', { channelId, language }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getPort: () => ipcRenderer.invoke('get-port'),
  // Opens DATA_DIR/user-assets in Explorer / Finder. The renderer cannot touch
  // the filesystem itself (contextIsolation), so main does it via shell.openPath.
  openUserAssets: () => ipcRenderer.invoke('open-user-assets'),
});
