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
test('Spielen prüft keine GitHub-Updates und öffnet den offiziellen Launcher',async()=>{
  const f=demo(),result=await f.ctrl.start();
  assert.equal(result.ok,true);
  assert.deepEqual(f.calls,['mods','fabric','settings','profile:8','launch']);
  assert.equal(f.ctrl.getState().progress,100);
  assert.equal(f.states.some(s=>s.phase==='checking-modpack'),false);
});
test('Auch bei verfügbaren Updates wird beim Spielen nichts heruntergeladen',async()=>{
  const f=demo({pack:{phase:'available',updates:2,conflicts:[]}});
  assert.equal((await f.ctrl.start()).ok,true);
  assert.equal(f.calls.includes('check'),false);
  assert.equal(f.calls.includes('install'),false);
});
test('Spielstart funktioniert ohne GitHub-Verbindung',async()=>{
  const f=demo({pack:{phase:'error',message:'Offline'}});
  assert.equal((await f.ctrl.start()).ok,true);
  assert.equal(f.calls.includes('check'),false);
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
