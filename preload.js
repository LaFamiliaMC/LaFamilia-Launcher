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
  getModpackStatus: () => ipcRenderer.invoke('modpack:get-state'),
  checkModpackUpdates: () => ipcRenderer.invoke('modpack:check'),
  installModpack: () => ipcRenderer.invoke('modpack:install'),
  cancelModpackDownload: () => ipcRenderer.invoke('modpack:cancel'),
  onModpackStatusChange: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('modpack:state',listener);
    return () => ipcRenderer.removeListener('modpack:state',listener);
  },
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveRam: (ramGb) => ipcRenderer.invoke('settings:save-ram', ramGb),
  openGameFolder: () => ipcRenderer.invoke('game:open-folder'),
  prepareMinecraftProfile: () => ipcRenderer.invoke('game:prepare-profile'),
  launchMinecraftOfficial: () => ipcRenderer.invoke('game:launch-official'),
  getPlayerProfile: () => ipcRenderer.invoke('player:get-profile'),
  refreshPlayerProfile: () => ipcRenderer.invoke('player:refresh-profile'),
  choosePlayerName: name => ipcRenderer.invoke('player:choose-name',name),
  getGameStartStatus: () => ipcRenderer.invoke('game:get-start-state'),
  onGameStartStatusChange: callback => {
    if(typeof callback!=='function')return ()=>{};
    const listener=(_event,state)=>callback(state);
    ipcRenderer.on('game:start-state',listener);
    return ()=>ipcRenderer.removeListener('game:start-state',listener);
  },
  openFabricInstallerPage: () => ipcRenderer.invoke('game:open-fabric-installer-page'),
  installFabricAutomatically: () => ipcRenderer.invoke('fabric:install'),
  getFabricInstallStatus: () => ipcRenderer.invoke('fabric:get-state'),
  onFabricInstallStatusChange: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event,status) => callback(status);
    ipcRenderer.on('fabric:state',listener);
    return () => ipcRenderer.removeListener('fabric:state',listener);
  },
  getMetricsUrl: () => ipcRenderer.invoke('server:get-metrics-url'),
  saveMetricsUrl: url => ipcRenderer.invoke('server:save-metrics-url',url),
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
  getNewsState: () => ipcRenderer.invoke('news:get-state'),
  refreshNews: () => ipcRenderer.invoke('news:refresh'),
  onNewsChange: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('news:state',listener);
    return () => ipcRenderer.removeListener('news:state',listener);
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
