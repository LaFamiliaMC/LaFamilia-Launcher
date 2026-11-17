'use strict';

// Nur die vorhandene Profilregisterkarte "Erfolge"; keine Fake-Erfolge oder Fake-FTB-Quests.
document.addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('lf-profile-achievements');
  if(!host)return;
  const api=window.laFamilia;
  host.classList.add('lf-achievements-container');
  host.innerHTML=`
    <div class="lf-achievements-header">
      <h4>Deine Erfolge</h4>
      <button type="button" id="lf-achievements-refresh" class="feature-button">Erfolge aktualisieren</button>
    </div>
    <div class="lf-achievements-summary">
      <div><span>Minecraft-Fortschritte</span><strong id="lf-achievements-count">—</strong></div>
      <div><span>Datenquelle</span><strong id="lf-achievements-source">—</strong></div>
    </div>
    <p id="lf-achievements-state" role="status" aria-live="polite">Noch keine Erfolgsdaten geladen.</p>
    <div class="lf-achievements-subheading">
      <h5>Abgeschlossene Fortschritte</h5>
      <span id="lf-achievements-list-caption">Neueste zuerst</span>
    </div>
    <div class="lf-achievements-list" id="lf-achievements-list" role="list"></div>
    <div class="lf-achievements-quest-note">
      <strong>FTB-Piratenquests</strong>
      <span>Noch nicht angebunden. Für Quests wird der echte FTB-Quests-Fortschritt benötigt.</span>
    </div>`;
  const byId=id=>document.getElementById(id);
  const list=byId('lf-achievements-list');
  const button=byId('lf-achievements-refresh');
  let uuid=null,request=0;

  function readableTitle(entry){
    const title=entry.title.trim();
    if(title&&!title.startsWith('advancements.')&&!title.startsWith('minecraft.'))return title;
    const file=entry.id.split(':')[1].split('/').at(-1);
    return file.replaceAll('_',' ').replace(/\b[a-z]/g,letter=>letter.toUpperCase());
  }
  function dateLabel(date){
    if(!date)return 'Zeitpunkt nicht gespeichert';
    const d=new Date(date);
    return Number.isNaN(d.getTime())?'Zeitpunkt nicht gespeichert':
      d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function reset(message){
    byId('lf-achievements-count').textContent='—';
    byId('lf-achievements-source').textContent='—';
    byId('lf-achievements-state').textContent=message;
    byId('lf-achievements-list-caption').textContent='Neueste zuerst';
    list.replaceChildren();
  }
  function show(data){
    if(!data.available){
      reset('Für diesen Spieler wurden noch keine gespeicherten Minecraft-Fortschritte gefunden.');
      byId('lf-achievements-source').textContent='Keine Datei';
      return;
    }
    byId('lf-achievements-count').textContent=data.completed.toLocaleString('de-DE');
    byId('lf-achievements-source').textContent=data.source==='live'?'Live-Server':'Gespeichert';
    byId('lf-achievements-state').textContent=data.source==='live'
      ?'Echte Fortschritte des aktuell verbundenen Spielers.'
      :'Echte Fortschritte aus der gespeicherten Minecraft-Welt.';
    list.replaceChildren();
    for(const entry of data.items){
      const item=document.createElement('div');
      item.className='lf-achievement';
      item.setAttribute('role','listitem');
      const icon=document.createElement('span');
      icon.className='lf-achievement-icon';
      icon.setAttribute('aria-hidden','true');
      icon.textContent='✦';
      const details=document.createElement('div');
      details.className='lf-achievement-info';
      const label=document.createElement('strong');
      label.textContent=readableTitle(entry);
      label.title=entry.id;
      const meta=document.createElement('small');
      meta.textContent=entry.id+' · '+dateLabel(entry.obtainedAt);
      details.append(label,meta);
      item.append(icon,details);
      list.append(item);
    }
    byId('lf-achievements-list-caption').textContent=data.completed>data.items.length
      ?'Die neuesten '+data.items.length+' von '+data.completed
      :'Alle '+data.completed+' abgeschlossenen';
    if(data.completed===0) {
      const empty=document.createElement('p');
      empty.className='lf-achievements-empty';
      empty.textContent='Du hast noch keine angezeigten Minecraft-Fortschritte abgeschlossen.';
      list.append(empty);
    }
  }
  async function refresh(){
    const own=++request;
    if(!uuid){reset('Bitte zuerst dein Minecraft-Profil laden.');return;}
    if(!api?.getPlayerAchievements){reset('Bitte den Launcher aktualisieren.');return;}
    button.disabled=true;
    byId('lf-achievements-state').textContent='Lese deine echten Minecraft-Erfolge …';
    try{
      const response=await api.getPlayerAchievements(uuid);
      if(own!==request)return;
      if(response?.ok&&response.achievements)show(response.achievements);
      else reset(response?.message||'Minecraft-Erfolge konnten nicht geladen werden.');
    }catch(error){
      if(own===request)reset('Erfolge konnten nicht geladen werden: '+String(error.message||error).slice(0,120));
    }finally{if(own===request)button.disabled=false;}
  }
  document.addEventListener('lafamilia:profile-changed',event=>{
    const next=event.detail?.uuid||null;
    if(next!==uuid){uuid=next;++request;reset('Noch keine Erfolge geladen.');}
  });
  host.parentElement?.querySelector('[data-lf-tab="achievements"]')
    ?.addEventListener('click',()=>void refresh());
  button.addEventListener('click',()=>void refresh());
});
