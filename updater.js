'use strict';
// Trennung vom Hauptprozess – lässt sich ohne echten GitHub-Release testen.
const fs = require('node:fs');
const path = require('node:path');

function createUpdaterController({ app, getWindow, resourcesPath, platform = process.platform, updaterFactory, fileExists = fs.existsSync }) {
  let autoUpdater;
  let inFlight = false;
  let installedUpdateReady = false;
  let snapshot = {
    phase: 'disabled',
    message: 'Updateprüfung nur in der installierten Windows-Version verfügbar',
    version: app.getVersion(),
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
    updateVersion: null
  };

  function dispatch(partial) {
    snapshot = { ...snapshot, ...partial };
    const win = getWindow();
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('updates:state', { ...snapshot });
    }
    return { ...snapshot };
  }

  function active() {
    if (platform !== 'win32' || !app.isPackaged) return false;
    const infoPath = path.join(resourcesPath, 'app-update.yml');
    if (!fileExists(infoPath)) {
      dispatch({ phase: 'not-configured', message: 'Kein GitHub-Releasekanal konfiguriert' });
      return false;
    }
    return true;
  }

  function initialize() {
    if (!active()) return snapshot;
    try {
      autoUpdater = updaterFactory();
    } catch (error) {
      return dispatch({ phase: 'error', message: `Updater konnte nicht geladen werden: ${error.message}` });
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('checking-for-update', () => dispatch({ phase: 'checking', message: 'GitHub wird nach Updates gefragt …', percent: 0 }));
    autoUpdater.on('update-available', (info) => {
      installedUpdateReady = false;
      dispatch({ phase: 'available', message: `Update ${info.version} gefunden – Download läuft an`, updateVersion: info.version, percent: 0 });
    });
    autoUpdater.on('download-progress', (info) => dispatch({
      phase: 'downloading', message: 'Launcher-Update wird heruntergeladen',
      percent: Math.max(0, Math.min(100, info.percent || 0)),
      transferred: info.transferred || 0, total: info.total || 0,
      bytesPerSecond: info.bytesPerSecond || 0
    }));
    autoUpdater.on('update-downloaded', (info) => {
      installedUpdateReady = true;
      dispatch({ phase: 'downloaded', message: `Version ${info.version} ist bereit – jetzt installieren oder beim Beenden`, updateVersion: info.version, percent: 100 });
    });
    autoUpdater.on('update-not-available', () => dispatch({ phase: 'current', message: 'La Familia ist auf dem neuesten Stand', percent: 0, updateVersion: null }));
    autoUpdater.on('error', (error) => dispatch({ phase: 'error', message: `Updateprüfung fehlgeschlagen: ${error.message}`, percent: 0 }));
    return dispatch({ phase: 'idle', message: 'GitHub-Updater bereit' });
  }

  async function check() {
    if (!autoUpdater) return { ...snapshot };
    if (inFlight || installedUpdateReady || snapshot.phase === 'downloading') return { ...snapshot };
    inFlight = true;
    dispatch({ phase: 'checking', message: 'Suche nach einer neuen Version …', percent: 0 });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      dispatch({ phase: 'error', message: `Keine Updateprüfung möglich: ${error.message}` });
    } finally {
      inFlight = false;
    }
    return { ...snapshot };
  }

  function install() {
    if (!installedUpdateReady || !autoUpdater) return { ok: false, reason: 'Es liegt kein heruntergeladenes Update bereit.' };
    // Installiert per NSIS und startet die Anwendung danach neu.
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  }

  return {
    initialize,
    check,
    install,
    state: () => ({ ...snapshot })
  };
}
module.exports = { createUpdaterController };
