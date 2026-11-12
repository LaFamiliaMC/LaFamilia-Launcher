'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const {ID,NAME,MC_VERSION,LOADER_VERSION,FABRIC_VERSION_ID,isFabricVersion,profileArgs,buildProfile,installedFabricVersions,prepareProfile}=require('../minecraft-launch');
async function setup(t,{profileExists=true,fabricExists=true}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-profile-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const minecraftRoot=path.join(root,'.minecraft');
  const gameDir=path.join(minecraftRoot,'la-familia');
  await fs.mkdir(minecraftRoot,{recursive:true});
  const profilePath=path.join(minecraftRoot,'launcher_profiles_microsoft_store.json');
  const original={
    profiles:{'existing-player':{name:'Meine echte Installation',lastVersionId:'1.21.1',gameDir:'D:\\Minecraft'}},
    authenticationDatabase:{secret:'nicht verändern'},settings:{keepLauncherOpen:true}
  };
  if(profileExists)await fs.writeFile(profilePath,JSON.stringify(original),'utf8');
  const version=FABRIC_VERSION_ID;
  if(fabricExists){
    const dir=path.join(minecraftRoot,'versions',version);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,version+'.json'),JSON.stringify({id:version,inheritsFrom:'1.21.1'}));
  }
  return {root,minecraftRoot,gameDir,profilePath,original,version};
}
test('Fabric 1.21.1 wird erkannt, andere Minecraft-Versionen nicht',()=>{
  assert.equal(MC_VERSION,'1.21.1');assert.equal(LOADER_VERSION,'0.19.5');
  assert.equal(isFabricVersion(FABRIC_VERSION_ID),true);
  assert.equal(isFabricVersion('fabric-loader-0.16.14-1.21.1'),false);
  assert.equal(isFabricVersion('fabric-loader-0.19.4-1.21.1'),false);
  assert.equal(isFabricVersion('fabric-loader-0.19.6-1.21.1'),false);
  assert.equal(isFabricVersion('fabric-loader-0.16.14-1.20.1'),false);
  assert.equal(isFabricVersion('forge-1.21.1'),false);
  assert.equal(isFabricVersion('../../fabric-loader-0.16.14-1.21.1'),false);
});
test('La-Familia-Profil bekommt dedizierten Spielordner und RAM',()=>{
  const profile=buildProfile({existing:{created:'2025-01-01T00:00:00.000Z',javaArgs:'-Xmx2G -XX:+UseG1GC'},
    versionId:FABRIC_VERSION_ID,gameDir:path.resolve('minecraft','la-familia'),ramGb:8});
  assert.equal(profile.name,NAME);
  assert.equal(profile.lastVersionId,FABRIC_VERSION_ID);
  assert.throws(()=>buildProfile({versionId:'fabric-loader-0.19.4-1.21.1',gameDir:path.resolve('minecraft'),ramGb:8}),/exakt/);
  assert.match(profile.javaArgs,/-Xmx8G/);
  assert.doesNotMatch(profile.javaArgs,/-Xmx2G/);
  assert.match(profile.javaArgs,/UseG1GC/);
  assert.equal(profile.created,'2025-01-01T00:00:00.000Z');
  assert.equal(profileArgs('-Xmx4G -Xmx6G -Dfoo=x',10),'-Xmx10G -Dfoo=x');
});
test('Windows Store Profil wird ergänzt und Account-/andere Profile bleiben erhalten',async t=>{
  const env=await setup(t);
  const processRunning=async()=>false;
  const result=await prepareProfile({...env,ramGb:6,processRunning});
  assert.equal(result.ok,true);assert.equal(result.unchanged,false);
  assert.equal(result.profileName,NAME);
  const actual=JSON.parse(await fs.readFile(env.profilePath,'utf8'));
  assert.deepEqual(actual.authenticationDatabase,env.original.authenticationDatabase);
  assert.deepEqual(actual.profiles['existing-player'],env.original.profiles['existing-player']);
  assert.equal(actual.profiles[ID].lastVersionId,env.version);
  assert.equal(actual.profiles[ID].gameDir,env.gameDir);
  assert.equal(actual.profiles[ID].javaArgs,'-Xmx6G');
  const backups=(await fs.readdir(env.minecraftRoot)).filter(name=>name.includes('lafamilia-backup'));
  assert.equal(backups.length,1);
  const again=await prepareProfile({...env,ramGb:6,processRunning});
  assert.equal(again.unchanged,true);
  const backupsNow=(await fs.readdir(env.minecraftRoot)).filter(name=>name.includes('lafamilia-backup'));
  assert.equal(backupsNow.length,1);
});
test('Wenn offizielle Minecraft Launcher läuft, wird Profil nicht überschrieben',async t=>{
  const env=await setup(t);
  const before=await fs.readFile(env.profilePath,'utf8');
  const result=await prepareProfile({...env,ramGb:8,processRunning:async()=>true});
  assert.equal(result.ok,false);
  assert.equal(result.code,'launcher_running');
  assert.equal(await fs.readFile(env.profilePath,'utf8'),before);
});
test('Fehlender Fabric Loader führt nicht zu einem Vanilla-Profil',async t=>{
  const env=await setup(t,{fabricExists:false});
  const result=await prepareProfile({...env,ramGb:6,processRunning:async()=>false});
  assert.equal(result.ok,false);
  assert.equal(result.code,'missing_fabric');
  const actual=JSON.parse(await fs.readFile(env.profilePath,'utf8'));
  assert.equal(actual.profiles[ID],undefined);
});
test('Ohne Minecraft Launcher Profil wird keine fremde Profildatei erzeugt',async t=>{
  const env=await setup(t,{profileExists:false});
  const result=await prepareProfile({...env,ramGb:6,processRunning:async()=>false});
  assert.equal(result.ok,false);
  assert.equal(result.code,'no_launcher_profiles');
  await assert.rejects(fs.stat(env.profilePath),{code:'ENOENT'});
});
test('Profil darf nur auf eine vorhandene, passende Fabric Versionsdatei verweisen',async t=>{
  const env=await setup(t);
  const versions=await installedFabricVersions(env.minecraftRoot);
  assert.deepEqual(versions,[env.version]);
  const other=path.join(env.minecraftRoot,'versions','fabric-loader-1.99.1-1.21.1');
  await fs.mkdir(other);
  await fs.writeFile(path.join(other,'fabric-loader-1.99.1-1.21.1.json'),JSON.stringify({id:'falsche-version'}));
  assert.deepEqual(await installedFabricVersions(env.minecraftRoot),[env.version]);
});

test('Schon vorhandene andere Fabric-Version genügt nicht für unser Profil',async t=>{
  const env=await setup(t,{fabricExists:false});
  const older='fabric-loader-0.19.4-1.21.1';
  const dir=path.join(env.minecraftRoot,'versions',older);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,older+'.json'),JSON.stringify({id:older,inheritsFrom:'1.21.1'}));
  assert.deepEqual(await installedFabricVersions(env.minecraftRoot),[]);
  const result=await prepareProfile({...env,ramGb:6,processRunning:async()=>false});
  assert.equal(result.ok,false);
  assert.equal(result.code,'missing_fabric');
});
test('Veraltetes La-Familia-Profil wird nur auf Zielversion aktualisiert',async t=>{
  const env=await setup(t);
  const data=JSON.parse(await fs.readFile(env.profilePath,'utf8'));
  data.profiles[ID]={name:'La Familia – Piraten Update',lastVersionId:'fabric-loader-0.19.4-1.21.1',gameDir:env.gameDir};
  await fs.writeFile(env.profilePath,JSON.stringify(data));
  const result=await prepareProfile({...env,ramGb:6,processRunning:async()=>false});
  assert.equal(result.ok,true);
  const actual=JSON.parse(await fs.readFile(env.profilePath,'utf8'));
  assert.equal(actual.profiles[ID].lastVersionId,FABRIC_VERSION_ID);
  assert.deepEqual(actual.profiles['existing-player'],env.original.profiles['existing-player']);
});
