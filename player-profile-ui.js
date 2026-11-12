'use strict';
// Die vorhandene Spielerprofil-Seite wird innerhalb der bestehenden mittleren Holzrahmen angezeigt.
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia;
  const host=document.getElementById('profile-page-content');
  if(!host)return;
  host.innerHTML=`
    <section class="lf-profile" aria-label="Minecraft-Java-Spielerprofil">
      <div class="lf-profile-heading">
        <h3>Dein Minecraft-Profil</h3>
        <button type="button" id="lf-profile-refresh" class="feature-button">Profil aktualisieren</button>
      </div>
      <nav class="lf-profile-tabs" aria-label="Profil-Reiter">
        <button type="button" class="lf-profile-tab active" data-lf-tab="overview" aria-pressed="true">Übersicht</button>
        <button type="button" class="lf-profile-tab" data-lf-tab="statistics" aria-pressed="false">Statistiken</button>
        <button type="button" class="lf-profile-tab" data-lf-tab="achievements" aria-pressed="false">Erfolge</button>
      </nav>
      <p id="lf-profile-status" role="status" aria-live="polite">Minecraft-Konto wird gelesen …</p>
      <div id="lf-profile-overview" class="lf-profile-layout">
        <div class="lf-profile-stage">
          <canvas id="lf-profile-skin" width="240" height="274" aria-label="Drehbarer 3D-Minecraft-Charakter"></canvas>
          <div id="lf-profile-empty" class="lf-profile-empty" hidden>Kein Skin geladen</div>
          <div class="lf-profile-pedestal" aria-hidden="true"></div>
          <p class="lf-profile-rotate-tip">Charakter mit der Maus drehen</p>
        </div>
        <div class="lf-profile-information">
          <h4 id="lf-profile-name">Nicht verbunden</h4>
          <dl>
            <dt>Minecraft Java</dt><dd id="lf-profile-edition">Nicht angemeldet</dd>
            <dt>Spieler-ID</dt><dd id="lf-profile-uuid">—</dd>
            <dt>Skin-Modell</dt><dd id="lf-profile-model">—</dd>
            <dt>Original-Cape</dt><dd id="lf-profile-cape">—</dd>
          </dl>
          <div class="lf-profile-manual">
            <label for="lf-profile-username">Spielername (falls nicht automatisch erkannt)</label>
            <div class="lf-profile-name-row">
              <input id="lf-profile-username" type="text" minlength="3" maxlength="16"
                placeholder="Minecraft-Name" autocomplete="off" spellcheck="false">
              <button type="button" id="lf-profile-load-name" class="feature-button">Skin laden</button>
            </div>
            <p>Nur öffentliche Skin-Anzeige, keine Microsoft-Anmeldung.</p>
          </div>
        </div>
      </div>
      <div id="lf-profile-statistics" class="lf-profile-additional" hidden>
        <h4>Deine Serverstatistiken</h4>
        <p>Spielzeit, Kills, abgebaute Blöcke und Quests werden später direkt vom La-Familia-Server geladen.</p>
        <p>Derzeit noch keine Verbindung zu Spielerstatistiken. Wir zeigen keine erfundenen Werte an.</p>
      </div>
      <div id="lf-profile-achievements" class="lf-profile-additional" hidden>
        <h4>Deine Erfolge</h4>
        <p>Hier erscheinen später echte Minecraft-Erfolge und abgeschlossene Piratenquests vom Server.</p>
        <p>Die Anbindung benötigt später unseren Server-Datendienst.</p>
      </div>
    </section>
  `;
  const byId=id=>document.getElementById(id);
  const name=byId('lf-profile-name'),status=byId('lf-profile-status');
  const refresh=byId('lf-profile-refresh'),canvas=byId('lf-profile-skin');
  const empty=byId('lf-profile-empty');
  let viewer=null,loaded=false,requestNumber=0;

  function updateStatsPlaceholder(){
    const values={'player-rank':'—','player-level':'—','player-xp-text':'Serverdaten folgen',
      'player-playtime':'—','player-kills':'—','player-blocks-placed':'—','player-blocks-mined':'—'};
    for(const [id,value] of Object.entries(values)){
      const el=byId(id);if(el)el.textContent=value;
    }
    const xp=byId('player-xp-bar');if(xp)xp.value=0;
  }
  function clearViewer(){
    if(viewer){viewer.dispose();viewer=null;}
    canvas.hidden=true;empty.hidden=false;
  }
  function pauseOutsideProfile(){
    if(viewer)viewer.renderPaused=Boolean(byId('page-profile')?.hidden);
  }
  async function showSkin(profile){
    clearViewer();
    if(!profile.skinData||!/^data:image\/png;base64,/.test(profile.skinData)){
      empty.textContent='Kein eigener Skin im Minecraft-Profil hinterlegt';
      return;
    }
    const library=window.skinview3d;
    if(!library?.SkinViewer){
      empty.textContent='3D-Viewer wurde nicht geladen. Bitte Launcher aktualisieren.';
      return;
    }
    try{
      viewer=new library.SkinViewer({canvas,width:240,height:274,skin:profile.skinData,
        model:profile.model==='slim'?'slim':'default'});
      viewer.background=null;
      viewer.autoRotate=true;
      viewer.autoRotateSpeed=0.65;
      viewer.zoom=0.88;
      viewer.controls.enableRotate=true;
      viewer.controls.enableZoom=false;
      viewer.controls.enablePan=false;
      if(profile.capeData&&profile.hasCape)await viewer.loadCape(profile.capeData);
      else await viewer.loadCape(null);
      empty.hidden=true;canvas.hidden=false;
      pauseOutsideProfile();
    }catch(error){
      clearViewer();
      empty.textContent='3D-Skin konnte nicht dargestellt werden: '+String(error.message||error);
    }
  }
  function renderAccountInfo(profile){
    name.textContent=profile.name||'Nicht verbunden';
    const sidebarName=byId('player-name');
    if(sidebarName)sidebarName.textContent=profile.name||'Nicht verbunden';
    byId('lf-profile-uuid').textContent=profile.uuid||'—';
    byId('lf-profile-edition').textContent=profile.uuid?
      (profile.source==='launcher'?'Java Edition erkannt':'Öffentliches Spielerprofil'):'Nicht angemeldet';
    byId('lf-profile-model').textContent=profile.skinData?(profile.model==='slim'?'Schmale Arme (Alex)':'Klassisch (Steve)'):'—';
    byId('lf-profile-cape').textContent=profile.hasCape?'Ja – echtes Minecraft-Cape':'Kein Cape im Profil';
    updateStatsPlaceholder();
  }
  async function loadProfile(force=false){
    if(!api?.getPlayerProfile){
      status.textContent='Minecraft-Profil ist nur in der Windows-Version verfügbar.';
      return;
    }
    const own=++requestNumber;
    refresh.disabled=true;
    status.textContent=force?'Minecraft-Skin und Profil werden neu geladen …':'Aktives Minecraft-Profil wird gesucht …';
    try{
      const profile=force?await api.refreshPlayerProfile():await api.getPlayerProfile();
      if(own!==requestNumber)return;
      renderAccountInfo(profile);
      status.textContent=profile.message||(profile.ok?'Offizielles Minecraft-Profil geladen.':'Minecraft-Profil konnte nicht geladen werden.');
      await showSkin(profile);
      loaded=Boolean(profile.ok);
    }catch(error){
      if(own!==requestNumber)return;
      status.textContent='Profil konnte nicht gelesen werden: '+error.message;
      clearViewer();
    }finally{
      if(own===requestNumber)refresh.disabled=false;
    }
  }

  const input=byId('lf-profile-username');
  const nameButton=byId('lf-profile-load-name');
  async function loadByName(){
    if(!api?.choosePlayerName){
      status.textContent='Namenssuche nur in der aktuellen Windows-Version verfügbar.';
      return;
    }
    const value=input.value.trim();
    if(!/^[a-zA-Z0-9_]{3,16}$/.test(value)){
      status.textContent='Bitte gültigen Minecraft-Namen mit 3–16 Zeichen eingeben.';
      return;
    }
    const own=++requestNumber;
    refresh.disabled=true;nameButton.disabled=true;
    status.textContent='Suche öffentliches Minecraft-Profil „'+value+'“ …';
    try{
      const profile=await api.choosePlayerName(value);
      if(own!==requestNumber)return;
      renderAccountInfo(profile);
      status.textContent=profile.message||(profile.ok?'Minecraft-Profil gefunden.':'Minecraft-Spieler nicht gefunden.');
      await showSkin(profile);
      loaded=Boolean(profile.ok);
    }catch(error){
      if(own!==requestNumber)return;
      status.textContent='Skin-Suche fehlgeschlagen: '+error.message;
      clearViewer();
    }finally{
      if(own===requestNumber){refresh.disabled=false;nameButton.disabled=false;}
    }
  }
  nameButton.addEventListener('click',()=>void loadByName());
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();void loadByName();}
  });
  refresh.addEventListener('click',()=>void loadProfile(true));
  const tabs=[...host.querySelectorAll('[data-lf-tab]')];
  for(const tab of tabs){
    tab.addEventListener('click',()=>{
      const selected=tab.dataset.lfTab;
      for(const button of tabs){
        const active=button===tab;
        button.classList.toggle('active',active);
        button.setAttribute('aria-pressed',String(active));
      }
      for(const [id,value] of [['lf-profile-overview','overview'],['lf-profile-statistics','statistics'],['lf-profile-achievements','achievements']]){
        byId(id).hidden=value!==selected;
      }
      if(viewer)viewer.renderPaused=selected!=='overview'||byId('page-profile')?.hidden;
    });
  }
  // Der Profil-Button schaltet ausschließlich den vorhandenen mittleren Inhalt um.
  byId('btn-profile')?.addEventListener('click',()=>{
    requestAnimationFrame(()=>{
      pauseOutsideProfile();
      if(!loaded)void loadProfile(false);
    });
  });
  const overviewButton=host.querySelector('[data-lf-tab="overview"]');
  overviewButton?.addEventListener('click',()=>requestAnimationFrame(pauseOutsideProfile));
  document.addEventListener('visibilitychange',()=>{
    if(viewer)viewer.renderPaused=document.hidden||Boolean(byId('page-profile')?.hidden);
  });
  updateStatsPlaceholder();
  // Bereits beim Launcherstart den echten Namen in die bestehende rechte Profiltafel eintragen.
  void loadProfile(false);
});
