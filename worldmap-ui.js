'use strict';

// Reale Weltkarte im bestehenden Mittelfenster. Die 3D-/2D-Ansichten,
// Dimensionen und Marker stammen ausschließlich vom BlueMap-Server.
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia;
  const host=document.getElementById('worldmap-page-content');
  if(!host)return;
  host.innerHTML=`
    <section class="lf-worldmap" aria-label="La Familia Serverweltkarte">
      <div class="lf-worldmap-toolbar">
        <div class="lf-worldmap-heading">
          <strong>Die Welt von La Familia</strong>
          <span>Interaktive Minecraft-Karte · Overworld, Nether und End, sofern gerendert</span>
        </div>
        <div class="lf-worldmap-controls">
          <button type="button" id="lf-map-refresh" class="feature-button">Aktualisieren</button>
          <button type="button" id="lf-map-browser" class="feature-button" hidden>Im Browser öffnen</button>
        </div>
      </div>
      <div class="lf-worldmap-viewport" id="lf-map-viewport">
        <div class="lf-worldmap-message" id="lf-map-message" role="status" aria-live="polite">
          <div class="lf-worldmap-compass" aria-hidden="true">✥</div>
          <h3 id="lf-map-message-title">Kartenserver wird geprüft …</h3>
          <p id="lf-map-message-body">Der Launcher sucht die echte Weltkarte deines Minecraft-Servers.</p>
        </div>
        <iframe id="lf-map-frame" title="Interaktive La Familia Minecraft-Karte"
          src="about:blank" sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          referrerpolicy="no-referrer" loading="lazy" hidden></iframe>
      </div>
      <div class="lf-worldmap-footer">
        <span id="lf-map-connection">Warte auf Kartenserver</span>
        <span>Mit der Maus bewegen und zoomen · Weltenwechsel in der Karte</span>
      </div>
    </section>`;
  const byId=id=>document.getElementById(id);
  const frame=byId('lf-map-frame'),message=byId('lf-map-message');
  const title=byId('lf-map-message-title'),body=byId('lf-map-message-body');
  const refreshButton=byId('lf-map-refresh'),browserButton=byId('lf-map-browser');
  const connection=byId('lf-map-connection');
  let generation=0,loading=false,lastCheck=0,wasReady=false;

  function showWaiting(heading,description,shortStatus){
    frame.hidden=true;
    frame.src='about:blank';
    message.hidden=false;
    title.textContent=heading;
    body.textContent=description;
    connection.textContent=shortStatus;
    browserButton.hidden=true;
    wasReady=false;
  }
  function showReady(){
    message.hidden=true;
    frame.hidden=false;
    if(frame.src!=='https://23.88.65.87/map/')frame.src='https://23.88.65.87/map/';
    connection.textContent='✓ BlueMap verbunden';
    browserButton.hidden=false;
    wasReady=true;
  }
  async function updateMap(force=false){
    if(!api?.checkWorldMap){
      showWaiting('Weltkarte nicht verfügbar','Bitte den La Familia Windows Launcher aktualisieren.','Launcher-Update erforderlich');
      return;
    }
    if(loading)return;
    if(!force&&wasReady&&Date.now()-lastCheck<30000)return;
    const own=++generation;
    loading=true;
    refreshButton.disabled=true;
    connection.textContent='Kartenserver wird geprüft …';
    if(!wasReady)showWaiting('Weltkarte wird gesucht','Verbinde mit der sicheren BlueMap-Adresse unseres Servers.','Prüfe HTTPS-Verbindung');
    try{
      const result=await api.checkWorldMap();
      if(own!==generation)return;
      lastCheck=Date.now();
      if(result?.ready){
        showReady();
      }else{
        const reason=result?.message||'Der Kartenserver ist noch nicht eingerichtet.';
        showWaiting('Noch keine Live-Weltkarte',reason+
          ' Die Karte wird automatisch angezeigt, sobald BlueMap installiert, gerendert und über Caddy unter /map/ verfügbar ist.',
          'BlueMap noch nicht erreichbar');
      }
    }catch(error){
      if(own!==generation)return;
      showWaiting('Weltkarte nicht erreichbar',
        'Die Verbindung zum Kartenserver konnte nicht geprüft werden. '+String(error.message||error).slice(0,120),
        'Verbindungsfehler');
    }finally{
      if(own===generation){loading=false;refreshButton.disabled=false;}
    }
  }
  refreshButton.addEventListener('click',()=>void updateMap(true));
  browserButton.addEventListener('click',async()=>{
    if(!wasReady)return;
    browserButton.disabled=true;
    try{await api?.openWorldMap?.();}
    catch(error){connection.textContent='Browserstart fehlgeschlagen: '+String(error.message||error).slice(0,90);}
    finally{browserButton.disabled=false;}
  });
  for(const id of ['btn-worldmap','btn-expand-map']){
    document.getElementById(id)?.addEventListener('click',()=>{
      requestAnimationFrame(()=>void updateMap());
    });
  }
  document.addEventListener('lafamilia:navigate',event=>{
    if(event.detail?.page==='worldmap')requestAnimationFrame(()=>void updateMap());
  });
  // Keine Hintergrundverbindungen zu BlueMap beim Start oder auf anderen Seiten.
  // Erst beim Öffnen der Weltkarte wird die Verbindung geprüft.
});
