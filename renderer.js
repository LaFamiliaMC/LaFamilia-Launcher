'use strict';

/**
 * La Familia – Frontend-Steuerung (Version 0.7)
 * - Navigation innerhalb von #main-content, rechte/linke Spalte bleiben stehen
 * - Sicherer Fensterzugriff nur via preload.js (window.laFamilia)
 * - RAM-Einstellung wird beim Vorbereiten des La-Familia-Profils übernommen
 * - Read-only Anzeige vorhandener .jar-Dateien im lokalen Mods-Ordner
 */

document.addEventListener('DOMContentLoaded', () => {
  const api = window.laFamilia || null;
  const byId = (id) => document.getElementById(id);
  const navigationButtons = [...document.querySelectorAll('#main-navigation [data-page]')];
  const pages = new Map([...document.querySelectorAll('#main-content > .launcher-page')]
    .map((element) => [element.id.replace(/^page-/, ''), element]));

  let activePage = 'home';
  let modRefreshId = 0;
  let systemInfo = null;

  // Das Originalbild und ALLE Hitboxes bleiben intern bei 1280 x 720.
  // Für diese Variante soll die gesamte Grafik den sichtbaren Bereich IMMER vollständig füllen.
  // Deshalb wird X und Y separat skaliert: keine Seitenbalken, keine freien Ränder.
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;
  function fitArtworkToViewport() {
    const artwork = byId('launcher-app');
    if (!artwork) return;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const scaleX = viewportWidth / DESIGN_WIDTH;
    const scaleY = viewportHeight / DESIGN_HEIGHT;
    artwork.style.left = '0px';
    artwork.style.top = '0px';
    artwork.style.transform = `scale(${scaleX}, ${scaleY})`;
    artwork.classList.add('layout-ready');
  }

  let resizePending = false;
  function scheduleFit() {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      fitArtworkToViewport();
    });
  }
  fitArtworkToViewport();
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', scheduleFit);

  function notify(message) {
    const area = byId('notification-container');
    if (!area) return;
    const note = document.createElement('div');
    note.className = 'toast';
    note.textContent = message;
    area.append(note);
    window.setTimeout(() => note.remove(), 3800);
    while (area.childElementCount > 3) area.firstElementChild.remove();
  }

  function switchPage(pageName) {
    const target = pages.get(pageName);
    if (!target || activePage === pageName) return;

    // Wichtig: nur den mittleren Inhaltsbereich austauschen.
    for (const [name, panel] of pages) {
      panel.hidden = name !== pageName;
      panel.classList.remove('page-entering');
    }
    target.classList.add('page-entering');
    target.addEventListener('animationend', () => target.classList.remove('page-entering'), { once: true });
    activePage = pageName;


  for (const button of navigationButtons) {
      const selected = button.dataset.page === pageName || (pageName === 'server' && button.dataset.page === 'settings');
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      byId(`label-nav-${button.dataset.page}`)?.classList.toggle('is-active', selected);
    }

    if (pageName === 'mods') void refreshMods();
  }

  document.addEventListener('lafamilia:navigate', event => switchPage(event.detail?.page));

  for (const button of navigationButtons) {
    button.addEventListener('click', () => switchPage(button.dataset.page));
    // Vektor-Schrift synchronisiert sich mit den transparenten Bild-Buttons.
    const label = byId(`label-nav-${button.dataset.page}`);
    button.addEventListener('mouseenter', () => label?.classList.add('is-hovered'));
    button.addEventListener('mouseleave', () => label?.classList.remove('is-hovered'));
    button.addEventListener('focus', () => label?.classList.add('is-hovered'));
    button.addEventListener('blur', () => label?.classList.remove('is-hovered'));
  }
  byId('label-nav-home')?.classList.add('is-active');

  function attachGo(buttonId, pageName) {
    byId(buttonId)?.addEventListener('click', () => switchPage(pageName));
  }
  attachGo('btn-manage-mods', 'mods');
  attachGo('btn-all-news', 'news');
  attachGo('btn-update-settings', 'settings');
  attachGo('btn-expand-map', 'worldmap');
  attachGo('btn-show-all-friends', 'friends');

  byId('btn-discord')?.addEventListener('click', () => {
    notify('Der Discord-Link wird später in der Konfiguration hinterlegt.');
  });
  byId('btn-play')?.addEventListener('click', async () => {
    const button=byId('btn-play');
    if(button.disabled)return;
    if(!api?.launchMinecraftOfficial){notify('Spielstart ist nur in der installierten Windows-Version verfügbar.');return;}
    button.disabled=true;
    byId('play-status').textContent='Modpack und Minecraft-Installation werden geprüft …';
    notify('Prüfe Modpack, Fabric und Minecraft-Profil …');
    try{
      const result=await api.launchMinecraftOfficial();
      const message=result.message||'Der offizielle Minecraft Launcher konnte nicht gestartet werden.';
      byId('play-status').textContent=message;
      notify(message);
      if(!result.ok&&['missing_fabric','no_launcher_profiles','modpack_missing','mods_empty'].includes(result.code)){
        if(result.code==='modpack_missing'||result.code==='mods_empty')switchPage('mods');
        else switchPage('settings');
      }
    }catch(error){
      byId('play-status').textContent='Minecraft-Start fehlgeschlagen: '+error.message;
      notify('Minecraft-Start fehlgeschlagen: '+error.message);
    }finally{button.disabled=false;}
  });

  // --- Titelleiste: sichere, einzelne Funktionen statt direktem Node.js-Zugriff ---
  async function runWindowCommand(command) {
    if (!api || typeof api[command] !== 'function') {
      notify('Fenstersteuerung ist nur in Electron verfügbar.');
      return;
    }
    try {
      const result = await api[command]();
      if ((command === 'toggleMaximize' || command === 'toggleFullscreen') && result) {
        updateMaximizeButton(Boolean(result.maximized), Boolean(result.fullscreen));
      }
      scheduleFit();
    } catch (error) {
      notify(`Fensteraktion fehlgeschlagen: ${error.message}`);
    }
  }
  byId('btn-minimize')?.addEventListener('click', () => void runWindowCommand('minimize'));
  byId('btn-maximize')?.addEventListener('click', () => void runWindowCommand('toggleMaximize'));
  byId('btn-close')?.addEventListener('click', () => void runWindowCommand('close'));

  function updateMaximizeButton(maximized, fullscreen = false) {
    const button = byId('btn-maximize');
    if (!button) return;
    const expanded = maximized || fullscreen;
    button.setAttribute('aria-label', expanded ? 'Fenster wiederherstellen' : 'Fenster maximieren');
    button.title = expanded ? 'Wiederherstellen' : 'Maximieren';
    // Das Icon ist schon in der Hintergrundgrafik, daher hier keinen Text einfügen.
    const fullscreenButton = byId('btn-toggle-fullscreen');
    if (fullscreenButton) fullscreenButton.textContent = fullscreen ? 'Vollbild verlassen (F11)' : 'Vollbild einschalten (F11)';
  }
  if (api) {
    api.onWindowStateChange(update => {
      updateMaximizeButton(update.maximized, update.fullscreen);
      scheduleFit();
    });
    api.getWindowState().then(state => updateMaximizeButton(state.maximized, state.fullscreen)).catch(() => {});
  }

  // --- Seite: Einstellungen / RAM ---
  function setupSettingsPage() {
    const host = byId('settings-page-content');
    if (!host) return;
    host.innerHTML = `
      <div class="settings-columns">
        <section class="detail-panel" aria-labelledby="settings-ram-title">
          <h3 id="settings-ram-title">Arbeitsspeicher (RAM)</h3>
          <p class="panel-explanation">Lege fest, wie viel RAM das La-Familia-Fabric-Profil verwenden soll.</p>
          <div class="ram-value-row">
            <label for="ram-slider">Minecraft zuweisen</label>
            <strong id="ram-value">6 GB</strong>
          </div>
          <input type="range" id="ram-slider" min="2" max="16" step="1" value="6" aria-describedby="ram-help">
          <div class="slider-labels"><span id="ram-min-label">2 GB</span><span id="ram-max-label">16 GB</span></div>
          <p id="ram-help">Die Einstellung wird beim nächsten Spielstart in das La-Familia-Minecraft-Profil übernommen.</p>
          <div class="java-argument">Vorgesehener Java-Parameter: <code id="java-args-preview">-Xmx6G</code></div>
          <button type="button" id="btn-save-ram" class="feature-button">RAM-Einstellung speichern</button>
          <p id="ram-save-status" role="status" aria-live="polite"></p>
        </section>
        <section class="detail-panel" aria-labelledby="settings-folder-title">
          <h3 id="settings-folder-title">Minecraft-Spielverzeichnis</h3>
          <p class="panel-explanation">Hier liegen die La-Familia-Mods und Konfigurationen.</p>
          <code id="settings-game-path" class="path-field">%APPDATA%\\.minecraft\\la-familia</code>
          <p id="system-memory">Gesamter RAM: wird ermittelt …</p>
          <button type="button" id="btn-open-game-folder" class="feature-button">Spielordner öffnen</button>
          <button type="button" id="btn-prepare-minecraft-profile" class="feature-button">Fabric-Profil einrichten</button>
          <button type="button" id="btn-open-fabric-installer" class="feature-button">Fabric Installer (offizielle Seite)</button>
          <p id="minecraft-profile-status" role="status" aria-live="polite"></p>
          <button type="button" id="btn-toggle-fullscreen" class="feature-button" title="Auch mit F11 umschaltbar">Vollbild einschalten (F11)</button>
          <button type="button" id="btn-server-settings" class="feature-button">Serverstatus &amp; Adresse</button>
          <button type="button" id="btn-check-launcher-updates" class="feature-button">Launcher-Update prüfen</button>
          <p id="settings-update-status" role="status" aria-live="polite"></p>
          <p id="folder-status" role="status" aria-live="polite"></p>
        </section>
      </div>
    `;

    const slider = byId('ram-slider');
    let stored = 6;
    try {
      const value = Number(window.localStorage.getItem('laFamilia.ramGb'));
      if (Number.isInteger(value) && value >= 2 && value <= 32) stored = value;
    } catch { /* Browser-Speicher ggf. blockiert */ }

    const updateRamPreview = () => {
      const gb = Number(slider.value);
      byId('ram-value').textContent = `${gb} GB`;
      byId('java-args-preview').textContent = `-Xmx${gb}G`;
      byId('ram-save-status').textContent = '';
    };
    slider.addEventListener('input', updateRamPreview);
    byId('btn-save-ram').addEventListener('click', async () => {
      const ramGb = Number(slider.value);
      try {
        if (api) {
          await api.saveRam(ramGb);
        } else {
          window.localStorage.setItem('laFamilia.ramGb', String(ramGb));
        }
        byId('ram-save-status').textContent = `Gespeichert: ${ramGb} GB (wird beim nächsten Spielstart ins Fabric-Profil übernommen).`;
        notify(`RAM-Vorgabe: ${ramGb} GB gespeichert.`);
      } catch (error) {
        byId('ram-save-status').textContent = `Konnte nicht gespeichert werden: ${error.message}`;
      }
    });
    byId('btn-prepare-minecraft-profile').addEventListener('click', async()=>{
      if(!api?.prepareMinecraftProfile){notify('Diese Funktion ist nur in der Windows-EXE verfügbar.');return;}
      const status=byId('minecraft-profile-status');
      status.textContent='Prüfe vorhandene Fabric-Installation …';
      try{
        const result=await api.prepareMinecraftProfile();
        status.textContent=result.ok?
          'La Familia – Piraten Update ist eingerichtet ('+result.versionId+').':
          result.message;
        notify(status.textContent);
      }catch(error){status.textContent='Profilfehler: '+error.message;notify(status.textContent);}
    });
    byId('btn-open-fabric-installer').addEventListener('click',async()=>{
      if(!api?.openFabricInstallerPage){notify('Fabric Installer: https://fabricmc.net/use/installer/');return;}
      try{await api.openFabricInstallerPage();}
      catch(error){notify('Fabric-Seite konnte nicht geöffnet werden: '+error.message);}
    });
    byId('btn-toggle-fullscreen').addEventListener('click', () => void runWindowCommand('toggleFullscreen'));
    byId('btn-check-launcher-updates').addEventListener('click', async () => {
      if (!api?.checkForUpdates) { notify('Automatische Updates werden nur in der installierten Windows-Version geprüft.'); return; }
      try { applyUpdateStatus(await api.checkForUpdates()); }
      catch (error) { notify(`Updateprüfung nicht möglich: ${error.message}`); }
    });
    byId('btn-open-game-folder').addEventListener('click', async () => {
      if (!api) { notify('Ordner öffnen funktioniert nur in Electron.'); return; }
      try {
        const path = await api.openGameFolder();
        byId('folder-status').textContent = `Ordner geöffnet: ${path}`;
      } catch (error) {
        byId('folder-status').textContent = `Ordner konnte nicht geöffnet werden: ${error.message}`;
      }
    });

    if (api) {
      Promise.all([api.getSystemInfo(), api.loadSettings()]).then(([info, saved]) => {
        systemInfo = info;
        byId('settings-game-path').textContent = info.gameDirectory;
        byId('system-memory').textContent = `Gesamter RAM: ${info.totalRamGb} GB`;
        if (Number.isInteger(saved.ramGb)) stored = saved.ramGb;
        const allowedMax = Math.max(2, Math.min(24, Math.floor(info.totalRamGb * 0.75)));
        slider.max = String(allowedMax);
        byId('ram-max-label').textContent = `${allowedMax} GB`;
        slider.value = String(Math.max(2, Math.min(allowedMax, stored)));
        updateRamPreview();
      }).catch(() => {
        slider.value = String(stored);
        updateRamPreview();
        byId('system-memory').textContent = 'Systeminformationen nicht verfügbar';
      });
    } else {
      slider.value = String(stored);
      updateRamPreview();
      byId('system-memory').textContent = 'Systeminformationen nur in Electron verfügbar';
    }
  }

  // --- Seite: Mods / lokal installierte .jar-Dateien ---
  function setupModsPage() {
    const host = byId('mods-page-content');
    if (!host) return;
    host.innerHTML = `
      <section class="detail-panel mods-detail-panel" aria-labelledby="mods-local-title">
        <div class="detail-header">
          <div>
            <h3 id="mods-local-title">Lokal installierte Mods</h3>
            <p class="panel-explanation">Es werden nur vorhandene JAR-Dateien angezeigt. Keine Dateien werden verändert.</p>
          </div>
          <strong id="mods-page-count" class="counter-badge">— Mods</strong>
        </div>
        <p id="mods-folder-path" class="path-field">%APPDATA%\\.minecraft\\la-familia\\mods</p>
        <div id="mods-page-status" role="status" aria-live="polite">Modliste wird gelesen …</div>
        <ul id="mods-page-list" class="full-mod-list" aria-label="Lokale Mods"></ul>
        <div class="mods-actions">
          <button type="button" id="btn-refresh-local-mods" class="feature-button">Modliste aktualisieren</button>
          <button type="button" id="btn-open-mod-folder" class="feature-button">Spielordner öffnen</button>
        </div>
      </section>
    `;
    byId('btn-refresh-local-mods').addEventListener('click', () => void refreshMods());
    byId('btn-open-mod-folder').addEventListener('click', async () => {
      if (!api) { notify('Ordner öffnen funktioniert nur in Electron.'); return; }
      try { await api.openGameFolder(); }
      catch (error) { notify(`Ordner konnte nicht geöffnet werden: ${error.message}`); }
    });
  }

  function setTextIfExists(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  document.addEventListener('lafamilia:mods-installed', () => void refreshMods());

  function renderNames(listId, mods) {
    const list = byId(listId);
    if (!list) return;
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const mod of mods) {
      const item = document.createElement('li');
      item.textContent = mod.name; // Dateinamen niemals als HTML interpretieren
      fragment.append(item);
    }
    list.append(fragment);
  }

  async function refreshMods() {
    const ownRequest = ++modRefreshId;
    setTextIfExists('mod-status', 'Lokale Modliste wird gelesen …');
    setTextIfExists('mods-page-status', 'Modliste wird gelesen …');

    if (!api) {
      setTextIfExists('mod-status', 'Browser-Vorschau: lokale Mods nur in Electron sichtbar');
      setTextIfExists('mods-page-status', 'Öffne diese Oberfläche in Electron, um deinen Mods-Ordner auszulesen.');
      setTextIfExists('installed-mod-count', '—');
      setTextIfExists('mods-page-count', '— Mods');
      return;
    }

    try {
      const result = await api.listLocalMods();
      if (ownRequest !== modRefreshId) return;
      const mods = Array.isArray(result.mods) ? result.mods : [];
      renderNames('mod-list', mods);
      renderNames('mods-page-list', mods);
      setTextIfExists('installed-mod-count', String(mods.length));
      setTextIfExists('mods-page-count', `${mods.length} Mods`);
      setTextIfExists('mods-folder-path', result.folder);
      setTextIfExists('mod-status', result.missing ? 'Mod-Ordner noch nicht vorhanden' : (mods.length ? 'Lokale Mods erkannt' : 'Noch keine Mods vorhanden'));
      setTextIfExists('mods-page-status', result.missing ? 'Der Ordner existiert noch nicht. Er wird nicht automatisch verändert.' : (mods.length ? `${mods.length} lokale Mod-Dateien gefunden` : 'Dieser Ordner enthält noch keine JAR-Dateien.'));
    } catch (error) {
      if (ownRequest !== modRefreshId) return;
      setTextIfExists('mod-status', 'Lokale Modliste konnte nicht geladen werden');
      setTextIfExists('mods-page-status', `Lesefehler: ${error.message}`);
    }
  }

  // --- Für weitere Navigationseinträge bereits beschriftete, nutzbare Seiten ---
  function setupInfoPage(containerId, description) {
    const host = byId(containerId);
    if (!host) return;
    const panel = document.createElement('div');
    panel.className = 'detail-panel info-panel';
    const emblem = document.createElement('div');
    emblem.className = 'info-emblem';
    emblem.textContent = '✦';
    emblem.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h3');
    title.textContent = 'Dieser Bereich wird vorbereitet';
    const paragraph = document.createElement('p');
    paragraph.className = 'panel-explanation';
    paragraph.textContent = description;
    const footnote = document.createElement('p');
    footnote.className = 'info-footnote';
    footnote.textContent = 'La Familia · Minecraft Fabric 1.21.1';
    panel.append(emblem, title, paragraph, footnote);
    host.append(panel);
  }


  // --- Updates: von electron-updater (nur im installierten Windows-NSIS-Build) ---
  function humanBytes(bytes) {
    const n = Number(bytes) || 0;
    return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
  }
  function applyUpdateStatus(data) {
    if (!data || typeof data !== 'object') return;
    const phase = String(data.phase || 'idle');
    const message = String(data.message || '');
    setTextIfExists('auto-update-status', phase === 'current' ? '✓ Launcher aktuell' :
      phase === 'downloaded' ? '✓ Launcher-Update bereit' :
      phase === 'downloading' ? '⬇ Update wird geladen' :
      phase === 'checking' ? 'Prüfe auf neue Versionen …' :
      phase === 'not-configured' ? 'Updatekanal fehlt' :
      phase === 'disabled' ? 'Nur im installierten Setup' :
      phase === 'error' ? 'Updateprüfung fehlgeschlagen' : 'Automatische Updates');
    setTextIfExists('update-status', phase === 'disabled' ? 'Keine Prüfung im Testmodus' : phase === 'not-configured' ? 'Noch keine GitHub Releases eingerichtet' : message);
    setTextIfExists('settings-update-status', message);
    setTextIfExists('auto-update-description', phase === 'disabled' || phase === 'not-configured'
      ? 'Online-Updates folgen nach der Einrichtung.'
      : 'Beim Start wird automatisch nach einer neuen Launcher-Version gesucht.');
    const isDownloading = phase === 'downloading';
    const progressRow = byId('update-progress-row');
    if (progressRow) progressRow.hidden = !isDownloading;
    if (isDownloading) {
      const progress = Math.max(0, Math.min(100, Number(data.percent) || 0));
      if (byId('update-progress')) byId('update-progress').value = progress;
      setTextIfExists('update-percentage', `${Math.round(progress)} %`);
      setTextIfExists('update-download-info', `${humanBytes(data.transferred)} / ${humanBytes(data.total)}`);
      setTextIfExists('update-speed', `${humanBytes(data.bytesPerSecond)}/s`);
    } else {
      setTextIfExists('update-download-info', '');
      setTextIfExists('update-speed', '');
    }
    const installButton = byId('btn-install-launcher-update');
    if (installButton) installButton.hidden = phase !== 'downloaded';
  }
  byId('btn-install-launcher-update')?.addEventListener('click', async () => {
    if (!api?.installUpdate) return;
    try {
      const answer = await api.installUpdate();
      if (!answer?.ok) notify(answer?.reason || 'Kein heruntergeladenes Update verfügbar.');
    } catch (error) { notify(`Installation fehlgeschlagen: ${error.message}`); }
  });
  if (api?.onUpdateStatusChange && api?.getUpdateStatus) {
    api.onUpdateStatusChange(applyUpdateStatus);
    api.getUpdateStatus().then(applyUpdateStatus).catch(() => {});
  } else {
    applyUpdateStatus({ phase: 'disabled', message: 'Updateprüfung nur in der installierten Windows-Version' });
  }

  setupSettingsPage();
  setupModsPage();
  setupInfoPage('quests-page-content', 'Die Questdaten werden später vom La-Familia-Server geladen.');
  setupInfoPage('worldmap-page-content', 'Die interaktive Weltkarte wird später mit dem Server verbunden. Die Mini-Karte rechts bleibt sichtbar.');
  setupInfoPage('friends-page-content', 'Die echte Freundesliste und Online-Anzeige werden später eingebunden.');
  setupInfoPage('profile-page-content', 'Hier erscheint später dein echtes Minecraft-Spielerprofil mit Skin und Statistiken.');
  setupInfoPage('statistics-page-content', 'Spielzeit, Erfolge und weitere Serverstatistiken werden hier später dargestellt.');

  // Beispiel-Quest-Reiter umschalten; keine echten Serverdaten vortäuschen.
  const examples = {
    daily: [ ['Sammle 128 Holz', 128], ['Baue 10 Cobblestone-Blöcke', 10], ['Besiege 5 Monster', 5] ],
    weekly: [ ['Erkunde 3 Biome', 3], ['Fange 12 Fische', 12], ['Handele 20 Mal', 20] ]
  };
  function setQuestTab(tab) {
    const daily = tab === 'daily';
    for (const [id, selected] of [['btn-daily-quests', daily], ['btn-weekly-quests', !daily]]) {
      const button = byId(id);
      button?.classList.toggle('active', selected);
      button?.setAttribute('aria-pressed', String(selected));
    }
    examples[tab].forEach(([label, target], index) => {
      const number = index + 1;
      setTextIfExists(`quest-name-${number}`, label);
      const progress = byId(`quest-progress-${number}`);
      if (progress) { progress.max = target; progress.value = 0; }
      setTextIfExists(`quest-count-${number}`, `0 / ${target}`);
    });
    setTextIfExists('quest-status', 'Beispielquests – noch keine Serververbindung');
  }
  byId('btn-daily-quests')?.addEventListener('click', () => setQuestTab('daily'));
  byId('btn-weekly-quests')?.addEventListener('click', () => setQuestTab('weekly'));

  // Startansicht beibehalten und lokale Mods laden.
  void refreshMods();
});
