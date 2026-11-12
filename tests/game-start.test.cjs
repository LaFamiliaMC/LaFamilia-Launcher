'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGameStartController}=require('../game-start');
function demo({pack={phase:'up-to-date',updates:0,conflicts:[]},
  installed={phase:'ready',updates:0,conflicts:[]},
  verified={phase:'up-to-date',updates:0,conflicts:[]},
  mods=[{name:'fabric-api.jar'}],fabric={ok:true},
  profile={ok:true,profileName:'La Familia – Piraten Update',versionId:'fabric-loader-0.19.5-1.21.1'},
  running=false,launch=async()=>({requested:true})}={}){
  const calls=[],states=[];let checks=0;
  const ctrl=createGameStartController({
    modpackManager:{
      check:async()=>{calls.push('check');return ++checks===1?pack:verified;},
      install:async()=>{calls.push('install');return installed;}
    },
    readInstalledMods:async()=>{calls.push('mods');return {mods};},
    installFabricIfNeeded:async()=>{calls.push('fabric');return fabric;},
    readSettings:async()=>{calls.push('settings');return {ramGb:8};},
    prepareProfile:async gb=>{calls.push('profile:'+gb);return profile;},
    openOfficialLauncher:async()=>{calls.push('launch');return launch();},
    isLauncherRunning:async()=>{calls.push('is-running');return running;},
    emit:state=>states.push(state)
  });
  return {ctrl,calls,states};
}
test('Keine Mod-Updates: Fabric, Profil und offizieller Launcher starten',async()=>{
  const f=demo(),result=await f.ctrl.start();
  assert.equal(result.ok,true);
  assert.deepEqual(f.calls,['check','mods','fabric','settings','profile:8','launch']);
  assert.equal(f.ctrl.getState().progress,100);
});
test('Fehlende Mods werden zuerst automatisch installiert und nachkontrolliert',async()=>{
  const f=demo({pack:{phase:'available',updates:2,conflicts:[]}});
  assert.equal((await f.ctrl.start()).ok,true);
  assert.deepEqual(f.calls,['check','is-running','install','check','mods','fabric','settings','profile:8','launch']);
  assert.ok(f.states.some(s=>s.phase==='updating-modpack'));
});
test('Fehlgeschlagener Mod-Download verhindert Minecraft-Start',async()=>{
  const f=demo({pack:{phase:'available',updates:1,conflicts:[]},installed:{phase:'error',message:'Hash falsch'}});
  assert.equal((await f.ctrl.start()).code,'modpack_error');
  assert.equal(f.calls.includes('launch'),false);
});
test('Restliche Mod-Änderungen nach Installation verhindern Start',async()=>{
  const f=demo({pack:{phase:'available',updates:1,conflicts:[]},verified:{phase:'available',updates:1,conflicts:[]}});
  assert.equal((await f.ctrl.start()).code,'modpack_unverified');
  assert.equal(f.calls.includes('fabric'),false);
});
test('Persönliche Dateien werden geschützt und nicht automatisch ersetzt',async()=>{
  const f=demo({pack:{phase:'conflicts',updates:2,conflicts:[{path:'mods/custom.jar'}]}});
  assert.equal((await f.ctrl.start()).code,'modpack_conflicts');
  assert.deepEqual(f.calls,['check']);
});
test('Keine Updates bei offenem Minecraft Launcher',async()=>{
  const f=demo({pack:{phase:'available',updates:1,conflicts:[]},running:true});
  assert.equal((await f.ctrl.start()).code,'launcher_running');
  assert.equal(f.calls.includes('install'),false);
});
test('Mods oder Fabric oder Profil fehlen: nie starten',async()=>{
  for(const [opts,code] of [[{mods:[]},'mods_empty'],[{fabric:{ok:false,code:'install_failed',message:'Fehler'}},'install_failed'],[{profile:{ok:false,code:'profile_error',message:'Fehler'}},'profile_error']]){
    const f=demo(opts);
    assert.equal((await f.ctrl.start()).code,code);
    assert.equal(f.calls.includes('launch'),false);
  }
});
test('Parallele Klicks erzeugen nur einen Launcher-Start',async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const f=demo({launch:async()=>{await pending;return {requested:true};}});
  const a=f.ctrl.start(),b=f.ctrl.start();
  assert.equal(a,b);release();
  assert.equal((await a).ok,true);
  assert.equal(f.calls.filter(x=>x==='launch').length,1);
});
test('Fehler im offiziellen Launcher werden zurückgemeldet',async()=>{
  const f=demo({launch:async()=>{throw Error('Launcher nicht gefunden');}});
  assert.equal((await f.ctrl.start()).code,'start_failed');
  assert.equal(f.ctrl.getState().active,false);
});
