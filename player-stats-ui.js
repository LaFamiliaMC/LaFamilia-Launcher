'use strict';
// Ergänzt nur den bestehenden Reiter "Statistiken". Holz-/Pergamentgrafik unverändert.
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia;
  const host=document.getElementById('lf-profile-statistics');
  if(!host)return;
  host.classList.add('lf-stats-container');
  host.innerHTML=`
    <div class="lf-stats-head">
      <h4>Deine Serverstatistiken</h4>
      <button type="button" id="lf-stats-refresh" class="feature-button">Aktualisieren</button>
    </div>
    <div class="lf-stats-values" aria-label="Echte Minecraft-Statistiken">
      <div><span>Spielzeit</span><strong id="lf-stats-playtime">—</strong></div>
      <div><span>Mob-Kills</span><strong id="lf-stats-mobs">—</strong></div>
      <div><span>Spieler-Kills</span><strong id="lf-stats-player-kills">—</strong></div>
      <div><span>Tode</span><strong id="lf-stats-deaths">—</strong></div>
      <div><span>Abgebaute Blöcke</span><strong id="lf-stats-mined">—</strong></div>
      <div><span>Minecraft-XP-Level</span><strong id="lf-stats-level">—</strong></div>
    </div>
    <p id="lf-stats-state" role="status" aria-live="polite">Noch keine Serverstatistiken geladen.</p>
    <div class="lf-stats-link">
      <p><strong>Mit deinem Serverprofil verbinden</strong></p>
      <p>Im Spiel <code>/lfstats link</code> eingeben. Den privaten Schlüssel hier eintragen.</p>
      <div class="lf-stats-inputs">
        <input id="lf-stats-url" type="url" placeholder="https://dein-server.de/status"
          maxlength="500" spellcheck="false" aria-label="HTTPS-Statistikadresse">
        <input id="lf-stats-token" type="password" maxlength="80" spellcheck="false"
          autocomplete="new-password" placeholder="Persönlicher Schlüssel"
          aria-label="Privater Statistik-Schlüssel">
      </div>
      <div class="lf-stats-actions">
        <button class="feature-button" type="button" id="lf-stats-connect">Verbinden</button>
        <button class="feature-button" type="button" id="lf-stats-disconnect">Trennen</button>
        <span id="lf-stats-link-status">Noch nicht verknüpft.</span>
      </div>
    </div>
    <p class="lf-stats-footnote">Echte Vanilla-Werte. Platzierte Blöcke, Piratenrang und FTB-Quests
      benötigen noch eine eigene Servererfassung. Datenzugang nur mit deinem Spielerschlüssel.</p>
  `;
  const DEFAULT_STATS_URL='https://23.88.65.87/status';
  const byId=id=>document.getElementById(id);
  const number=n=>Number.isSafeInteger(n)?n.toLocaleString('de-DE'):'—';
  const formatTime=ticks=>{
    if(!Number.isSafeInteger(ticks)||ticks<0)return '—';
    const minutes=Math.floor(ticks/1200);
    const hours=Math.floor(minutes/60);
    return hours?hours+' Std. '+minutes%60+' Min.':minutes+' Min.';
  };
  let currentUuid=null,query=0;
  const fieldMap=[
    ['lf-stats-playtime','playTimeTicks',formatTime],
    ['lf-stats-mobs','mobKills',number],
    ['lf-stats-player-kills','playerKills',number],
    ['lf-stats-deaths','deaths',number],
    ['lf-stats-mined','blocksMined',number],
    ['lf-stats-level','mcLevel',number]
  ];
  function show(stats){
    for(const [id,key,formatter] of fieldMap)byId(id).textContent=stats?formatter(stats[key]):'—';
    const set=(id,val)=>{const el=byId(id);if(el)el.textContent=val;};
    set('player-playtime',stats?formatTime(stats.playTimeTicks):'—');
    set('player-kills',stats?number(stats.mobKills+stats.playerKills):'—');
    set('player-blocks-mined',stats?number(stats.blocksMined):'—');
    set('player-blocks-placed','—');
    set('player-level',stats&&stats.mcLevel!==null?number(stats.mcLevel):'—');
    set('player-rank','—');
    set('player-xp-text',stats&&stats.mcLevel!==null?'Minecraft XP-Level':'Rangdaten folgen');
    const bar=byId('player-xp-bar');if(bar)bar.value=0;
  }
  async function refresh(){
    const own=++query;
    if(!currentUuid){show(null);byId('lf-stats-state').textContent='Bitte zuerst dein Minecraft-Spielerprofil laden.';return;}
    if(!api?.getPlayerStats){byId('lf-stats-state').textContent='Serverstatistiken sind in dieser Launcher-Version nicht verfügbar.';return;}
    byId('lf-stats-state').textContent='Lade echte Spielerstatistiken vom Server …';
    try{
      const result=await api.getPlayerStats(currentUuid);
      if(own!==query)return;
      if(result?.ok&&result.stats){
        show(result.stats);
        byId('lf-stats-state').textContent=(result.stats.online?'Spieler ist online.':'Gespeicherte Offline-Statistik.')+
          ' Letzte Aktualisierung: '+new Date().toLocaleTimeString('de-DE');
      }else{
        show(null);
        byId('lf-stats-state').textContent=result?.message||'Serverstatistiken sind nicht verfügbar.';
      }
    }catch(error){if(own===query){show(null);byId('lf-stats-state').textContent='Statistikabruf fehlgeschlagen: '+error.message;}}
  }
  async function loadConfig(){
    if(!api?.getPlayerStatsConfig)return;
    try{
      const s=await api.getPlayerStatsConfig();
      byId('lf-stats-url').value=s.url||DEFAULT_STATS_URL;
      byId('lf-stats-link-status').textContent=s.hasToken?'Spielerschlüssel hinterlegt.':'Noch nicht verknüpft.';
    }catch(error){byId('lf-stats-link-status').textContent=error.message;}
  }
  byId('lf-stats-refresh').addEventListener('click',()=>void refresh());
  byId('lf-stats-connect').addEventListener('click',async()=>{
    if(!currentUuid){byId('lf-stats-state').textContent='Bitte zuerst deinen Minecraft-Spielernamen laden.';return;}
    const button=byId('lf-stats-connect');
    button.disabled=true;
    try{
      const result=await api.connectPlayerStats({
        uuid:currentUuid,url:byId('lf-stats-url').value.trim()||DEFAULT_STATS_URL,token:byId('lf-stats-token').value
      });
      byId('lf-stats-token').value='';
      byId('lf-stats-url').value=result.url;
      byId('lf-stats-link-status').textContent='Verbunden – privater Schlüssel gespeichert.';
      await refresh();
    }catch(error){
      byId('lf-stats-link-status').textContent='Verbindung fehlgeschlagen: '+error.message;
    }finally{button.disabled=false;}
  });
  byId('lf-stats-disconnect').addEventListener('click',async()=>{
    try{
      await api.disconnectPlayerStats();
      ++query;show(null);byId('lf-stats-token').value='';
      byId('lf-stats-link-status').textContent='Verbindung aus diesem Launcher entfernt.';
      byId('lf-stats-state').textContent='Nicht verknüpft. Mit /lfstats unlink lässt sich der Schlüssel auch auf dem Server widerrufen.';
    }catch(error){byId('lf-stats-link-status').textContent='Trennen fehlgeschlagen: '+error.message;}
  });
  document.addEventListener('lafamilia:profile-changed',event=>{
    const id=event.detail?.uuid||null;
    if(id!==currentUuid){currentUuid=id;show(null);}
    if(id)void refresh();
  });
  // Automatische Nachladung, wenn der Spieler den Statistik-Reiter öffnet.
  host.parentElement?.querySelector('[data-lf-tab="statistics"]')?.addEventListener('click',()=>void refresh());
  void loadConfig();
});
