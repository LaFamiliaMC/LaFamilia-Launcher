'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia;
  const element=id=>document.getElementById(id);
  const put=(id,value)=>{const target=element(id);if(target)target.textContent=value;};
  function navigate(){document.dispatchEvent(new CustomEvent('lafamilia:navigate',{detail:{page:'server'}}));}
  document.addEventListener('click',event=>{
    const id=event.target?.id;
    if(id==='btn-server-details'||id==='btn-server-settings')navigate();
  });
  function update(data){
    if(!data||typeof data!=='object')return;
    const online=data.phase==='online';
    const status=online?'Online':data.phase==='offline'?'Offline':data.phase==='checking'?'Prüfe Verbindung …':'Nicht eingerichtet';
    const players=online&&data.playersOnline!==null&&data.playersMax!==null?data.playersOnline+'/'+data.playersMax:'—';
    const ping=online&&Number.isFinite(data.pingMs)?data.pingMs+' ms':'—';
    const version=online?String(data.version||'Unbekannt'):'—';
    put('friends-status','Server: '+status);
    element('friends-status')?.classList.toggle('server-online',online);
    element('friends-status')?.classList.toggle('server-offline',data.phase==='offline');
    put('server-home-players','Spieler: '+players);
    put('server-home-ping','Ping: '+ping);
    put('server-home-version','Version: '+version);
    put('sidebar-connection-status','Server: '+status);
    put('server-status','Serverstatus: '+status);
    put('server-player-count','Spieler online: '+players);
    put('server-detail-state',status);
    put('server-detail-address',data.address||'Keine Adresse hinterlegt');
    put('server-detail-players',players);
    put('server-detail-ping',ping);
    put('server-detail-version',version);
    put('server-error',data.phase==='offline'?String(data.error||'Server antwortet nicht.'):'');
    if(data.checkedAt){
      const time=new Date(data.checkedAt);
      put('server-last-check',Number.isNaN(time.getTime())?'—':time.toLocaleTimeString('de-DE'));
    }
  }
  element('btn-server-refresh')?.addEventListener('click',async()=>{
    if(!api?.refreshServerStatus)return;
    try{update(await api.refreshServerStatus());}catch(error){put('server-error',error.message);}
  });
  element('btn-server-save')?.addEventListener('click',async()=>{
    if(!api?.saveServerAddress)return;
    try{
      await api.saveServerAddress(element('server-address-input')?.value||'');
      put('server-save-feedback','Adresse gespeichert.');
      update(await api.getServerStatus());
    }catch(error){put('server-save-feedback','Fehler: '+error.message);}
  });
  if(api?.getServerAddress){
    api.getServerAddress().then(data=>{
      if(element('server-address-input'))element('server-address-input').value=data.address||'';
    }).catch(()=>{});
  }
  if(api?.onServerStatusChange&&api?.getServerStatus){
    api.onServerStatusChange(update);
    api.getServerStatus().then(update).catch(()=>{});
  }else update({phase:'unconfigured',online:false,address:''});
});
