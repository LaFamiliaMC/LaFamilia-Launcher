'use strict';
/* La Familia – Modpack-Steuerung nur im bestehenden mittleren Launcher-Bereich. */
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia;
  const main=document.querySelector('#mods-page-content .mods-detail-panel');
  if(!main)return;
  const el=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const panel=el('section','lf-modpack-manager');
  panel.setAttribute('aria-label','La Familia Modpack von GitHub');
  const heading=el('div','lf-pack-heading');
  const title=el('h3','lf-pack-title','La Familia · Modpack');
  const version=el('span','lf-pack-version','Fabric 1.21.1');
  heading.append(title,version);
  const message=el('p','lf-pack-message','Modpack wird mit GitHub verbunden …');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const stats=el('div','lf-pack-stats');
  const counts=el('span','lf-pack-counts','— Mods · — Resourcepacks · — Configs');
  const changes=el('span','lf-pack-changes','Prüfung läuft');
  stats.append(counts,changes);
  const progressRow=el('div','lf-pack-progress-row');
  const bar=el('progress','lf-pack-progress');
  bar.max=100;bar.value=0;
  const percent=el('span','lf-pack-percent','0 %');
  progressRow.append(bar,percent);progressRow.hidden=true;
  const actions=el('div','lf-pack-actions');
  const check=el('button','feature-button lf-pack-button','Auf Updates prüfen');
  check.type='button';
  const install=el('button','feature-button lf-pack-button','Modpack installieren / aktualisieren');
  install.type='button';
  const cancel=el('button','feature-button lf-pack-button','Download abbrechen');
  cancel.type='button';cancel.hidden=true;
  actions.append(check,install,cancel);
  const hints=el('p','lf-pack-hint','Verwaltet nur La-Familia-Dateien. Eigene Mods, Resourcepacks und geänderte Configs bleiben erhalten.');
  const conflictWrapper=el('details','lf-pack-conflicts');
  const summary=el('summary','','Geschützte Dateien (0)');
  const conflicts=el('ul','');
  conflictWrapper.append(summary,conflicts);conflictWrapper.hidden=true;
  panel.append(heading,message,stats,progressRow,actions,hints,conflictWrapper);
  main.prepend(panel);
  let lastPhase=null;
  function formatBytes(n){
    if(!Number.isFinite(n)||n<1)return '0 MB';
    return (n/1024/1024).toLocaleString('de-DE',{maximumFractionDigits:1})+' MiB';
  }
  function render(state){
    if(!state||typeof state!=='object')return;
    const working=['checking','downloading','verifying','installing','recovering'].includes(state.phase);
    message.textContent=String(state.message||'Bereit');
    version.textContent='Fabric 1.21.1 · '+(state.version?'Modpack '+state.version:'GitHub');
    counts.textContent=[
      state.modCount??0,'Mods ·',state.resourcepackCount??0,'Resourcepacks ·',
      state.configCount??0,'Configs'
    ].join(' ');
    changes.textContent=state.updates>0?(state.updates+' Änderungen, '+state.pendingMods+' Mods'):
      state.phase==='up-to-date'||state.phase==='ready'?'Aktuell':state.phase==='checking'?'Prüfung …':'Keine Updates';
    progressRow.hidden=!['downloading','verifying','installing'].includes(state.phase);
    if(!progressRow.hidden){
      bar.value=Math.max(0,Math.min(100,Number(state.progress)||0));
      percent.textContent=String(bar.value)+' % · '+formatBytes(state.downloadedBytes||0)+' / '+formatBytes(state.totalBytes||0);
    }
    const installingPossible=['available','conflicts','up-to-date','ready'].includes(state.phase);
    install.disabled=working||!installingPossible;
    install.textContent=state.updates>0?'Modpack installieren / aktualisieren':'Installation abgleichen';
    check.disabled=working;cancel.hidden=state.phase!=='downloading';
    cancel.disabled=state.phase!=='downloading';
    const list=Array.isArray(state.conflicts)?state.conflicts:[];
    conflictWrapper.hidden=!list.length;
    summary.textContent='Geschützte Dateien ('+list.length+(list.length>=100?'+':'')+')';
    conflicts.replaceChildren(...list.slice(0,25).map(item=>el('li','',item.path+' – '+item.reason)));
    if(state.error)message.textContent=state.message;
    if(['ready','conflicts'].includes(state.phase)&&lastPhase==='installing'){
      document.dispatchEvent(new Event('lafamilia:mods-installed'));
    }
    lastPhase=state.phase;
    const cardStatus=document.getElementById('mod-status');
    if(cardStatus&&['downloading','verifying','installing','error','available','ready','conflicts'].includes(state.phase)){
      cardStatus.textContent=state.phase==='downloading'?'Download: '+(state.progress||0)+' %':
        state.phase==='installing'?'Mods werden installiert …':
        state.phase==='available'?'Modpack-Update verfügbar':
        state.phase==='error'?'Modpack-Prüfung fehlgeschlagen':
        state.phase==='conflicts'?'Eigene Configs geschützt':
        state.phase==='ready'?'Modpack aktualisiert':'Dateien werden geprüft …';
    }
  }
  const handle=async(fn)=>{
    try{render(await fn());}
    catch(error){message.textContent='Fehler: '+error.message;}
  };
  check.addEventListener('click',()=>{if(api?.checkModpackUpdates)void handle(api.checkModpackUpdates);});
  install.addEventListener('click',()=>{
    if(!api?.installModpack)return;
    if(!window.confirm('La Familia Modpack in %APPDATA%\\.minecraft\\la-familia installieren bzw. aktualisieren?\nVorhandene eigene Dateien bleiben erhalten.')){
      return;
    }
    void handle(api.installModpack);
  });
  cancel.addEventListener('click',()=>{if(api?.cancelModpackDownload)void handle(api.cancelModpackDownload);});
  if(api?.onModpackStatusChange&&api?.getModpackStatus){
    api.onModpackStatusChange(render);
    api.getModpackStatus().then(render).catch(error=>{message.textContent='Statusfehler: '+error.message;});
  }else message.textContent='Der Modpack-Download funktioniert in der installierten Windows-Version.';
});
