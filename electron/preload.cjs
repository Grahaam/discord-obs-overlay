'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  completeSetup: (token, channelId) =>
    ipcRenderer.invoke('complete-setup', { token, channelId }),
  getPort: () => ipcRenderer.invoke('get-port'),
  // Opens DATA_DIR/user-assets in Explorer / Finder. The renderer cannot touch
  // the filesystem itself (contextIsolation), so main does it via shell.openPath.
  openUserAssets: () => ipcRenderer.invoke('open-user-assets'),
});
