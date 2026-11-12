'use strict';
// Ein-Klick-Spielvorbereitung; Microsoft-Login und letzter Spielstart bleiben beim offiziellen Launcher.
function createGameStartController({modpackManager,readInstalledMods,installFabricIfNeeded,
  readSettings,prepareProfile,openOfficialLauncher,isLauncherRunning=async()=>false,emit=()=>{}}){
  let active=null, snapshot={phase:'idle',message:'Bereit',progress:0,active:false};
  function status(phase,message,progress,working=true){
    snapshot={phase,message,progress,active:working};emit({...snapshot});return {...snapshot};
  }
  function stop(code,message){status('error',message,0,false);return {ok:false,code,message};}
  async function perform(){
    try{
      status('checking-modpack','Prüfe Modpack über GitHub …',5);
      const pack=await modpackManager.check();
      if(pack.phase==='error')return stop('modpack_error',pack.message||'Modpack-Prüfung fehlgeschlagen.');
      if(!['available','ready','up-to-date','conflicts'].includes(pack.phase))return stop('modpack_busy','Modverwaltung arbeitet noch. Bitte erneut versuchen.');
      if(pack.conflicts?.length)return stop('modpack_conflicts','Eigene oder veränderte Modpack-Dateien erkannt. Bitte im Mods-Bereich prüfen.');
      if(pack.phase==='available'||pack.updates>0||pack.removals>0){
        if(await isLauncherRunning())return stop('launcher_running','Bitte den offiziellen Minecraft Launcher vor dem Mod-Update schließen.');
        status('updating-modpack','Fehlende Mods, Resourcepacks und Configs werden installiert …',12);
        const done=await modpackManager.install();
        if(done.phase==='error')return stop('modpack_error',done.message||'Modpack-Installation fehlgeschlagen.');
        if(done.conflicts?.length)return stop('modpack_conflicts','Geschützte Dateien entdeckt. Bitte im Mods-Bereich prüfen.');
        if(done.phase!=='ready'||done.updates>0)return stop('modpack_unverified','Modpack-Installation nicht bestätigt.');
        status('verifying-modpack','Prüfe Modpack nach dem Download erneut …',83);
        const checked=await modpackManager.check();
        if(checked.phase!=='up-to-date'||checked.updates>0||checked.conflicts?.length)
          return stop('modpack_unverified','Dateiprüfung nach der Installation fehlgeschlagen. Bitte Mods prüfen.');
      }
      status('checking-mods','Kontrolliere lokale Mods …',86);
      const local=await readInstalledMods();
      if(!Array.isArray(local?.mods)||local.mods.length===0)
        return stop('mods_empty','Keine Mods gefunden. Bitte Mods-Bereich prüfen.');
      status('checking-fabric','Prüfe Fabric 0.19.5 für Minecraft 1.21.1 …',89);
      const fabric=await installFabricIfNeeded();
      if(!fabric.ok)return stop(fabric.code||'install_failed',fabric.message||'Fabric-Installation fehlgeschlagen.');
      status('preparing-profile','Richte das La-Familia-Profil mit deiner RAM-Einstellung ein …',95);
      const ram=await readSettings();
      const profile=await prepareProfile(ram.ramGb);
      if(!profile.ok)return stop(profile.code||'profile_error',profile.message||'Profilfehler.');
      status('opening-launcher','Öffne den offiziellen Minecraft Launcher …',98);
      const opened=await openOfficialLauncher();
      const message='Mods und Fabric 1.21.1 / Loader 0.19.5 sind bereit. Im offiziellen Minecraft Launcher „La Familia – Piraten Update“ auswählen und auf „Spielen“ klicken.';
      status('ready',message,100,false);
      return {ok:true,code:'launcher_open_requested',profileName:profile.profileName,
        versionId:profile.versionId,profileFile:profile.profileFile,gameDir:profile.gameDir,
        ramGb:ram.ramGb,requested:opened.requested,message};
    }catch(error){return stop('start_failed','Spielvorbereitung fehlgeschlagen: '+String(error?.message||error));}
  }
  function start(){if(active)return active;active=perform().finally(()=>{active=null;});return active;}
  return {start,getState:()=>({...snapshot})};
}
module.exports={createGameStartController};
