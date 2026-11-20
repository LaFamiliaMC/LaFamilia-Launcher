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
      // Kein GitHub-Modcheck beim Spielen: Updates und Installation bleiben im Mods-Bereich.
      // Lokale Mods und Fabric werden weiterhin vor dem Öffnen geprüft.
      status('checking-mods','Kontrolliere lokale Mods …',15);
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
