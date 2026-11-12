'use strict';

// Nur gezielte, geprüfte Funktionen an die Oberfläche freigeben.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('laFamilia', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  close: () => ipcRenderer.invoke('window:close'),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  listLocalMods: () => ipcRenderer.invoke('mods:list-local'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveRam: (ramGb) => ipcRenderer.invoke('settings:save-ram', ramGb),
  openGameFolder: () => ipcRenderer.invoke('game:open-folder'),
  getServerStatus: () => ipcRenderer.invoke('server:get-status'),
  refreshServerStatus: () => ipcRenderer.invoke('server:refresh'),
  getServerAddress: () => ipcRenderer.invoke('server:get-address'),
  saveServerAddress: address => ipcRenderer.invoke('server:save-address',address),
  onServerStatusChange: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event,value) => callback(value);
    ipcRenderer.on('server:status',listener);
    return () => ipcRenderer.removeListener('server:status',listener);
  },
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatusChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onWindowStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback({ maximized: Boolean(value?.maximized), fullscreen: Boolean(value?.fullscreen) });
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  }
});
