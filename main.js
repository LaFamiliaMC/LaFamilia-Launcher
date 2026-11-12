'use strict';

// La Familia – Electron-Hauptprozess (Schritt 3)
// Fabric-Profilanbindung über den offiziellen Minecraft Launcher; kein eigener OAuth-Start.
const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createUpdaterController } = require('./updater');
const { parseAddress, queryJavaStatus } = require('./server-status');
const { queryServerMetrics, validateMetricsUrl } = require('./server-metrics');
const { createNewsController } = require('./news-feed');
const { createModpackManager } = require('./modpack-manager');
const { prepareProfile, openOfficialLauncher, FABRIC_HELP_URL } = require('./minecraft-launch');
const { ensureFabric } = require('./fabric-auto-install');
const { createGameStartController } = require('./game-start');
const { launcherProcessRunning } = require('./minecraft-launch');

const firstInstance = app.requestSingleInstanceLock();
if(!firstInstance) app.quit();
app.on('second-instance',()=>{
  if(mainWindow&&!mainWindow.isDestroyed()){
    if(mainWindow.isMinimized())mainWindow.restore();
    mainWindow.focus();
  }
});
let mainWindow;
let updatesController;
let serverRefreshInterval;
let newsRefreshInterval;
let newsController;
let modpackManager;
let gameStartController;
let fabricInstallPromise=null;
let fabricStatus={phase:'idle',message:'Fabric Loader wird bei Bedarf automatisch installiert.'};
let serverCheckPromise;
let serverSnapshot = {phase:'checking',online:false,address:'23.88.65.87:25565',playersOnline:null,playersMax:null,pingMs:null,version:null,checkedAt:null,error:null,tps:null,uptimeSeconds:null,telemetryAvailable:false,telemetryError:null};

function setFabricStatus(phase,message){
  fabricStatus={phase,message};
  if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.webContents.isDestroyed()){
    mainWindow.webContents.send('fabric:state',{...fabricStatus});
  }
  return {...fabricStatus};
}
function installFabricIfNeeded(){
  if(fabricInstallPromise)return fabricInstallPromise;
  fabricInstallPromise=(async()=>{
    setFabricStatus('checking','Prüfe Fabric Loader 0.19.5 für Minecraft 1.21.1 …');
    try{
      const result=await ensureFabric({
        minecraftRoot:path.join(app.getPath('appData'),'.minecraft'),
        userData:app.getPath('userData'),
        update:message=>setFabricStatus('installing',message)
      });
      setFabricStatus(result.ok?'ready':'action-needed',
        result.ok?(result.code==='installed'?'Fabric Loader 0.19.5 für Minecraft 1.21.1 installiert.':'Fabric Loader 0.19.5 für Minecraft 1.21.1 ist bereits vorhanden.'):result.message);
      return result;
    }catch(error){
      const message='Fabric-Installation fehlgeschlagen: '+error.message;
      setFabricStatus('error',message);
      return {ok:false,code:'install_failed',message};
    }
  })().finally(()=>{fabricInstallPromise=null;});
  return fabricInstallPromise;
}
function getGameDirectory() {
  return path.join(app.getPath('appData'), '.minecraft', 'la-familia');
}

function getModsDirectory() {
  return path.join(getGameDirectory(), 'mods');
}

function getSettingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

async function readSettings() {
  try {
    const raw = await fs.readFile(getSettingsFile(), 'utf8');
    const data = JSON.parse(raw);
    const ramGb = Number(data?.ramGb);
    return { ramGb: Number.isInteger(ramGb) && ramGb >= 2 && ramGb <= 24 ? ramGb : 6 };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { ramGb: 6 };
    throw error;
  }
}

async function saveRamSetting(ramGb) {
  if (!Number.isInteger(ramGb) || ramGb < 2 || ramGb > 24) {
    throw new Error('Ungültiger RAM-Wert');
  }
  const file = getSettingsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryFile, JSON.stringify({ ramGb }, null, 2), 'utf8');
    await fs.rename(temporaryFile, file);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw error;
  }
  return { ramGb };
}



function getServerConfigFile() {
  return path.join(app.getPath('userData'), 'server.json');
}
async function loadServerAddress() {
  for (const file of [getServerConfigFile(),path.join(__dirname,'config','server.json')]) {
    try {
      const data=JSON.parse(await fs.readFile(file,'utf8'));
      const value=typeof data.address==='string'?data.address.trim():'';
      return value?parseAddress(value).address:'';
    }catch(error){
      if(error.code==='ENOENT')continue;
      return '';
    }
  }
  return '';
}
async function loadMetricsUrl(){
  for(const file of [path.join(app.getPath('userData'),'metrics.json'),path.join(__dirname,'config','server.json')]){
    try{
      const o=JSON.parse(await fs.readFile(file,'utf8'));
      const value=typeof o.url==='string'?o.url:o.metricsUrl;
      if(value==='')return '';
      if(typeof value==='string')return validateMetricsUrl(value);
    }catch(e){if(e.code==='ENOENT')continue;return '';}
  }
  return '';
}
async function saveMetricsUrl(value){
  if(typeof value!=='string')throw Error('Ungültige Metrik-Adresse.');
  const url=value.trim()?validateMetricsUrl(value):'';
  const file=path.join(app.getPath('userData'),'metrics.json');
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.tmp';
  try{await fs.writeFile(tmp,JSON.stringify({url},null,2),'utf8');await fs.rename(tmp,file);}
  catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e;}
  return {url};
}
function emitServerStatus(fields) {
  serverSnapshot={...serverSnapshot,...fields};
  if(mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()){
    mainWindow.webContents.send('server:status',{...serverSnapshot});
  }
  return {...serverSnapshot};
}
async function refreshServerStatus(){
  if(serverCheckPromise)return serverCheckPromise;
  serverCheckPromise=(async()=>{
    const address=await loadServerAddress();
    if(!address)return emitServerStatus({phase:'unconfigured',online:false,address:'',playersOnline:null,playersMax:null,pingMs:null,version:null,tps:null,uptimeSeconds:null,telemetryAvailable:false,checkedAt:null,error:null});
    emitServerStatus({phase:'checking',address,error:null,telemetryError:null});
    const url=await loadMetricsUrl();
    const [javaResult,metricsResult]=await Promise.allSettled([
      queryJavaStatus(address,{timeoutMs:5000}),
      url?queryServerMetrics(url,{timeoutMs:3000}):Promise.resolve(null)
    ]);
    const java=javaResult.status==='fulfilled'?javaResult.value:null;
    const metrics=metricsResult.status==='fulfilled'?metricsResult.value:null;
    return emitServerStatus({
      phase:java?'online':'offline',online:Boolean(java),address,
      playersOnline:java?.playersOnline??null,playersMax:java?.playersMax??null,
      pingMs:java?.pingMs??null,version:java?.version??null,
      tps:java&&metrics?metrics.tps:null,uptimeSeconds:java&&metrics?metrics.uptimeSeconds:null,
      telemetryAvailable:Boolean(java&&metrics),
      telemetryError:metricsResult.status==='rejected'?String(metricsResult.reason?.message||'Metrik-Schnittstelle nicht erreichbar').slice(0,100):null,
      checkedAt:new Date().toISOString(),error:java?null:String(javaResult.reason?.message||'Server nicht erreichbar').slice(0,160)
    });
  })();
  try{return await serverCheckPromise;}finally{serverCheckPromise=null;}
}
async function saveServerAddress(value){
  if(typeof value!=='string')throw new Error('Ungültige Serveradresse.');
  const address=value.trim()?parseAddress(value).address:'';
  const file=getServerConfigFile();
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';
  try{
    await fs.writeFile(temp,JSON.stringify({address},null,2),'utf8');
    await fs.rename(temp,file);
  }catch(error){
    await fs.rm(temp,{force:true}).catch(()=>{});
    throw error;
  }
  return {address};
}

function getTrustedWindow(event) {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!mainWindow || senderWindow !== mainWindow || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Unzulässige Fensteranfrage');
  }
  return senderWindow;
}

async function readInstalledMods() {
  const folder = getModsDirectory();
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { mods: [], folder, missing: true };
    throw error;
  }

  // Es werden ausschließlich die Dateinamen lokal vorhandener JAR-Mods gelesen.
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.jar'))
    .map((entry) => ({ name: entry.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

  return { mods: files, folder, missing: false };
}

function getWindowState(window) {
  return {
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen()
  };
}

function sendWindowState(window) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send('window:state', getWindowState(window));
  }
}

function getInitialWindowDimensions() {
  // Electron liefert CSS-/DIP-Pixel: dadurch stimmt die Größe auch bei 125/150 % Windows-Skalierung.
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(800, Math.floor(Math.min(1600, workWidth, workHeight * 16 / 9)));
  return { width, height: Math.round(width * 9 / 16) };
}

function createWindow() {
  const initialSize = getInitialWindowDimensions();
  mainWindow = new BrowserWindow({
    ...initialSize,
    minWidth: 800,
    minHeight: 450,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    useContentSize: true,
    frame: false,
    thickFrame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // Die Updateprüfung erfolgt bei jedem normalen Programmstart.
    updatesController = createUpdaterController({
      app,
      getWindow: () => mainWindow,
      resourcesPath: process.resourcesPath,
      updaterFactory: () => require('electron-updater').autoUpdater
    });
    updatesController.initialize();
    void updatesController.check();
    newsController = createNewsController({cacheFile:path.join(app.getPath('userData'),'news-cache.json'),getWindow:()=>mainWindow});
    void newsController.initialize();
    void modpackManager?.check();
    if(newsRefreshInterval)clearInterval(newsRefreshInterval);
    newsRefreshInterval=setInterval(()=>{void newsController?.refresh();},120000);
    void refreshServerStatus();
    if (serverRefreshInterval) clearInterval(serverRefreshInterval);
    serverRefreshInterval = setInterval(() => { void refreshServerStatus(); }, 30000);
  });
  mainWindow.on('maximize', () => sendWindowState(mainWindow));
  mainWindow.on('unmaximize', () => sendWindowState(mainWindow));
  mainWindow.on('enter-full-screen', () => sendWindowState(mainWindow));
  mainWindow.on('leave-full-screen', () => sendWindowState(mainWindow));
  mainWindow.on('restore', () => sendWindowState(mainWindow));
  mainWindow.on('closed', () => {
    if (serverRefreshInterval) clearInterval(serverRefreshInterval);
    serverRefreshInterval = null;
    if (newsRefreshInterval) clearInterval(newsRefreshInterval);
    newsRefreshInterval = null;
    newsController = null;
    mainWindow = null;
  });

  // F11 oder Alt+Enter: echtes Vollbild, auch bei rahmenlosem Electron-Fenster.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt && !input.control && !input.meta)) {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    }
  });

  // Kein zusätzliches Fenster durch Web-Links oder window.open().
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

if(firstInstance)app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('de.lafamilia.minecraftlauncher');
  modpackManager=createModpackManager({
    gameDir:getGameDirectory(),
    userData:app.getPath('userData'),
    getWindow:()=>mainWindow
  });
  gameStartController=createGameStartController({
    modpackManager,readInstalledMods,installFabricIfNeeded,readSettings,
    prepareProfile:ramGb=>prepareProfile({
      minecraftRoot:path.join(app.getPath('appData'),'.minecraft'),
      gameDir:getGameDirectory(),ramGb,preferForPlay:true
    }),
    openOfficialLauncher,isLauncherRunning:launcherProcessRunning,
    emit:state=>{
      if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.webContents.isDestroyed())
        mainWindow.webContents.send('game:start-state',state);
    }
  });
  ipcMain.handle('modpack:get-state',event=>{
    getTrustedWindow(event);return modpackManager.getState();
  });
  ipcMain.handle('modpack:check',event=>{
    getTrustedWindow(event);return modpackManager.check();
  });
  ipcMain.handle('modpack:install',event=>{
    getTrustedWindow(event);return modpackManager.install();
  });
  ipcMain.handle('modpack:cancel',event=>{
    getTrustedWindow(event);return modpackManager.cancel();
  });
  ipcMain.handle('news:get-state',event=>{
    getTrustedWindow(event);
    return newsController?newsController.state():{phase:'loading',articles:[],message:'Neuigkeiten werden geladen …'};
  });
  ipcMain.handle('news:refresh',async event=>{
    getTrustedWindow(event);
    return newsController?newsController.refresh():{phase:'loading',articles:[],message:'News-Feed wird vorbereitet …'};
  });
  ipcMain.handle('updates:get-state', (event) => {
    getTrustedWindow(event);
    return updatesController ? updatesController.state() : { phase: 'checking', message: 'Updateprüfung wird vorbereitet', percent: 0 };
  });
  ipcMain.handle('updates:check', async (event) => {
    getTrustedWindow(event);
    return updatesController ? updatesController.check() : { phase: 'idle', message: 'Noch nicht bereit' };
  });
  ipcMain.handle('updates:install', (event) => {
    getTrustedWindow(event);
    return updatesController ? updatesController.install() : { ok: false, reason: 'Kein Update bereit' };
  });


  ipcMain.handle('server:get-metrics-url',async event=>{
    getTrustedWindow(event);return {url:await loadMetricsUrl()};
  });
  ipcMain.handle('server:save-metrics-url',async(event,url)=>{
    getTrustedWindow(event);const saved=await saveMetricsUrl(url);await refreshServerStatus();return saved;
  });
  ipcMain.handle('server:get-status', event => {
    getTrustedWindow(event);
    return {...serverSnapshot};
  });
  ipcMain.handle('server:get-address', async event => {
    getTrustedWindow(event);
    return {address:await loadServerAddress()};
  });
  ipcMain.handle('server:refresh', async event => {
    getTrustedWindow(event);
    return refreshServerStatus();
  });
  ipcMain.handle('server:save-address', async (event,address) => {
    getTrustedWindow(event);
    if(serverCheckPromise)await serverCheckPromise;
    const saved=await saveServerAddress(address);
    await refreshServerStatus();
    return saved;
  });

  ipcMain.handle('window:minimize', (event) => getTrustedWindow(event).minimize());
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = getTrustedWindow(event);
    if (win.isFullScreen()) win.setFullScreen(false);
    else if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return getWindowState(win);
  });
  ipcMain.handle('window:toggle-fullscreen', (event) => {
    const win = getTrustedWindow(event);
    win.setFullScreen(!win.isFullScreen());
    return getWindowState(win);
  });
  ipcMain.handle('window:close', (event) => getTrustedWindow(event).close());
  ipcMain.handle('window:get-state', (event) => getWindowState(getTrustedWindow(event)));

  ipcMain.handle('system:info', (event) => {
    getTrustedWindow(event);
    return {
      totalRamGb: Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10,
      gameDirectory: getGameDirectory(),
      modsDirectory: getModsDirectory()
    };
  });

  ipcMain.handle('settings:load', async (event) => {
    getTrustedWindow(event);
    return readSettings();
  });

  ipcMain.handle('settings:save-ram', async (event, ramGb) => {
    getTrustedWindow(event);
    return saveRamSetting(ramGb);
  });

  ipcMain.handle('mods:list-local', async (event) => {
    getTrustedWindow(event);
    return readInstalledMods();
  });

  ipcMain.handle('fabric:get-state', event=>{getTrustedWindow(event);return {...fabricStatus};});
  ipcMain.handle('fabric:install', async event=>{getTrustedWindow(event);return installFabricIfNeeded();});
  ipcMain.handle('game:prepare-profile', async(event) => {
    getTrustedWindow(event);
    const fabric=await installFabricIfNeeded();
    if(!fabric.ok)return fabric;
    const ram=await readSettings();
    return prepareProfile({
      minecraftRoot:path.join(app.getPath('appData'),'.minecraft'),
      gameDir:getGameDirectory(),
      ramGb:ram.ramGb
    });
  });
  ipcMain.handle('game:open-fabric-installer-page', async(event) => {
    getTrustedWindow(event);
    await shell.openExternal(FABRIC_HELP_URL);
    return {ok:true};
  });
  ipcMain.handle('game:get-start-state',event=>{getTrustedWindow(event);return gameStartController.getState();});
  ipcMain.handle('game:launch-official',async event=>{getTrustedWindow(event);return gameStartController.start();});
  ipcMain.handle('game:open-folder', async (event) => {
    getTrustedWindow(event);
    const folder = getGameDirectory();
    await fs.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return folder;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
