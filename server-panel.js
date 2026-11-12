'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia,byId=id=>document.getElementById(id);
  const put=(id,value)=>{const node=byId(id);if(node)node.textContent=value;};
  function uptime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return '—';
    const d=Math.floor(seconds/86400),h=Math.floor((seconds%86400)/3600),m=Math.floor((seconds%3600)/60);
    return d?d+' Tage '+h+' Std.':h?h+' Std. '+m+' Min.':m+' Min.';
  }
  function bars(id,score){const node=byId(id);if(node)node.dataset.bars=Number.isFinite(score)?String(Math.max(0,Math.min(4,score))):'0';}
  function render(data){
    if(!data||typeof data!=='object')return;
    const online=data.phase==='online', status=online?'Online':data.phase==='offline'?'Offline':data.phase==='checking'?'Prüfe …':'Keine Adresse';
    put('lf-server-state',status);
    const led=byId('lf-server-led');if(led)led.className='lf-server-led '+(online?'is-online':data.phase==='offline'?'is-offline':'is-pending');
    const players=online&&Number.isInteger(data.playersOnline)&&Number.isInteger(data.playersMax)?data.playersOnline+' / '+data.playersMax:'— / —';
    put('lf-server-player-summary',players);put('lf-server-players',online?players:'—');
    put('lf-server-version',online?String(data.version||'Unbekannt'):'—');
    const v=byId('lf-server-version');if(v)v.title=online?String(data.version||''):'';
    put('lf-server-modpack','La Familia');
    put('lf-server-uptime',online?uptime(data.uptimeSeconds):'—');
    put('lf-server-tps',online&&data.telemetryAvailable&&Number.isFinite(data.tps)?data.tps.toFixed(1):'—');
    put('lf-server-ping',online&&Number.isFinite(data.pingMs)?data.pingMs+' ms':'—');
    bars('lf-tps-bars',online&&data.telemetryAvailable&&Number.isFinite(data.tps)?(data.tps>=19.5?4:data.tps>=18?3:data.tps>=15?2:1):null);
    bars('lf-ping-bars',online&&Number.isFinite(data.pingMs)?(data.pingMs<80?4:data.pingMs<150?3:data.pingMs<250?2:1):null);
    byId('lf-server-panel')?.setAttribute('aria-label','Minecraft Server '+status+'; Spieler '+players);
  }
  if(api?.getServerStatus&&api?.onServerStatusChange){api.onServerStatusChange(render);api.getServerStatus().then(render).catch(()=>{});}
  else render({phase:'unconfigured'});
});
