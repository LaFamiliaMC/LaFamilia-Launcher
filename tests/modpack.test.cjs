'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {normalizeManifest,safeRelative,trustedAssetURL,createPlan}=require('../modpack-core');
const {extractVerifiedZip}=require('../modpack-zip');
const {createModpackManager}=require('../modpack-manager');
const HASH=value=>crypto.createHash('sha256').update(value).digest('hex');
const BASE='https://github.com/LaFamiliaMC/LaFamilia-Modpack/releases/download/modpack-v1.0.0/';
const data=Buffer.from('mods example'),configData=Buffer.from('config example');
function entry(category,filename,buffer){
  const rel=category+'/'+filename;
  return {path:rel,size:buffer.length,sha256:HASH(buffer),...(category==='mods'?{file:filename,url:BASE+'mod-aaaa-'+filename}:{})};
}
function manifest({mods=[],resourcepacks=[],config=[],rpArchive=null,confArchive=null}={}){
  return {schemaVersion:2,packId:'la-familia',minecraftVersion:'1.21.1',modLoader:'fabric',version:'1.0.0',
    mods,resourcepacks:{archive:rpArchive,files:resourcepacks},config:{archive:confArchive,files:config}};
}
function zipFile(filename,buffer){
  const name=Buffer.from(filename,'utf8');
  const crc=typeof zlib.crc32==='function'?zlib.crc32(buffer):crc32(buffer);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);
  local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
  local.writeUInt32LE(crc>>>0,14);
  local.writeUInt32LE(buffer.length,18);local.writeUInt32LE(buffer.length,22);
  local.writeUInt16LE(name.length,26);
  const center=Buffer.alloc(46);
  center.writeUInt32LE(0x02014b50,0);
  center.writeUInt16LE(20,4);center.writeUInt16LE(20,6);center.writeUInt16LE(0x0800,8);
  center.writeUInt32LE(crc>>>0,16);center.writeUInt32LE(buffer.length,20);center.writeUInt32LE(buffer.length,24);
  center.writeUInt16LE(name.length,28);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(center.length+name.length,12);
  end.writeUInt32LE(local.length+name.length+buffer.length,16);
  return Buffer.concat([local,name,buffer,center,name,end]);
}
function crc32(bytes){
  let crc=-1;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^(-1))>>>0;
}
async function tempDir(){
  return fs.mkdtemp(path.join(os.tmpdir(),'la-familia-modpack-test-'));
}
test('Manifest V2 normalisieren, alle Bereiche und Hashes prüfen',()=>{
  const m=normalizeManifest(manifest({mods:[entry('mods','fabric-api.jar',data)],resourcepacks:[entry('resourcepacks','Fancy Pack.zip',configData)],
    rpArchive:{file:'resourcepacks.zip',size:50,sha256:HASH('zip'),url:BASE+'resourcepacks.zip'}}));
  assert.equal(m.mods.length,1);assert.equal(m.all.length,2);
  assert.equal(m.resourcepacks.files.length,1);
  assert.throws(()=>safeRelative('config/../../world/level.dat','config'));
  assert.throws(()=>safeRelative('mods/CON.jar','mods'));
  assert.throws(()=>trustedAssetURL('https://evil.example/payload.jar'));
  assert.throws(()=>normalizeManifest(manifest({mods:[entry('mods','fabric-api.jar',data),entry('mods','FABRIC-API.jar',data)]})),/Doppelter/);
  assert.throws(()=>normalizeManifest({...manifest(),modLoader:'forge'}),/nicht kompatibel/);
});
test('Fremde oder veränderte Configs werden nicht überschrieben',async t=>{
  const root=await tempDir();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'config'),{recursive:true});
  await fs.writeFile(path.join(root,'config','settings.toml'),'Persönlich');
  const desired=entry('config','settings.toml',configData);
  const m=normalizeManifest(manifest({config:[desired],confArchive:{file:'config.zip',size:70,sha256:HASH('zip'),url:BASE+'config.zip'}}));
  const p=await createPlan(m,null,root);
  assert.equal(p.pending.length,0);assert.equal(p.conflicts.length,1);
  const state={schema:1,version:'0.9.0',managed:{'config/settings.toml':{sha256:HASH('Vorher'),size:6}}};
  const q=await createPlan(m,state,root);
  assert.equal(q.pending.length,0);assert.equal(q.conflicts.length,1);
});
test('Nur alte unveränderte verwaltete Mods entfernen',async t=>{
  const root=await tempDir();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'mods'));
  await fs.writeFile(path.join(root,'mods','old.jar'),data);
  await fs.writeFile(path.join(root,'mods','custom.jar'),data);
  const state={schema:1,version:'0.9.0',managed:{'mods/old.jar':{sha256:HASH(data),size:data.length}}};
  const p=await createPlan(normalizeManifest(manifest()),state,root);
  assert.equal(p.removals.length,1);
  assert.equal(p.removals[0].path,'mods/old.jar');
  assert.equal(await fs.readFile(path.join(root,'mods','custom.jar'),'utf8'),'mods example');
});
test('ZIP wird nur in Staging extrahiert und inhaltlich verifiziert',async t=>{
  const dir=await tempDir();t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const archive=path.join(dir,'rp.zip'),out=path.join(dir,'stage');
  await fs.writeFile(archive,zipFile('TestPack.zip',data));
  await extractVerifiedZip(archive,'resourcepacks',[entry('resourcepacks','TestPack.zip',data)],out);
  assert.equal(await fs.readFile(path.join(out,'TestPack.zip'),'utf8'),'mods example');
});
test('ZIP-Traversal und falsche SHA-256 verweigern',async t=>{
  const dir=await tempDir();t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const archive=path.join(dir,'rp.zip'),out=path.join(dir,'stage');
  await fs.writeFile(archive,zipFile('../escape.txt',data));
  await assert.rejects(extractVerifiedZip(archive,'resourcepacks',[entry('resourcepacks','TestPack.zip',data)],out));
  await fs.writeFile(archive,zipFile('TestPack.zip',data));
  await assert.rejects(extractVerifiedZip(archive,'resourcepacks',[entry('resourcepacks','TestPack.zip',Buffer.from('NOT SAME'))],out));
});
test('Manager installiert nur geprüfte neue Mods und schützt fremde',async t=>{
  const root=await tempDir();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const game=path.join(root,'minecraft'),userData=path.join(root,'user');
  await fs.mkdir(path.join(game,'mods'),{recursive:true});
  await fs.writeFile(path.join(game,'mods','own.jar'),'persönliche Mod');
  const m=normalizeManifest(manifest({mods:[entry('mods','example.jar',data),entry('mods','own.jar',Buffer.from('not same'))]}));
  const mgr=createModpackManager({
    gameDir:game,userData,getWindow:()=>null,
    fetchLatest:async()=>({manifest:m,manifestSha256:HASH('manifest')}),
    download:async(asset,dir,{onProgress}={})=>{
      await fs.mkdir(dir,{recursive:true});
      const target=path.join(dir,'fake.jar');
      await fs.writeFile(target,data);onProgress?.(data.length);
      return target;
    }
  });
  const initial=await mgr.check();
  assert.equal(initial.pendingMods,1);
  assert.equal(initial.conflicts.length,1);
  const result=await mgr.install();
  assert.equal(result.phase,'conflicts');
  assert.equal(await fs.readFile(path.join(game,'mods','example.jar'),'utf8'),'mods example');
  assert.equal(await fs.readFile(path.join(game,'mods','own.jar'),'utf8'),'persönliche Mod');
  const state=JSON.parse(await fs.readFile(path.join(userData,'modpack-state.json'),'utf8'));
  assert.equal(state.managed['mods/example.jar'].sha256,HASH(data));
  assert.equal(state.managed['mods/own.jar'],undefined);
});

test('Abgebrochene Installation stellt bestehende verwaltete Mod wieder her',async t=>{
  const root=await tempDir();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const game=path.join(root,'minecraft'),userData=path.join(root,'user');
  const oldBytes=Buffer.from('Version alt'),newBytes=Buffer.from('Version neu');
  const otherBytes=Buffer.from('Zweiter Download');
  await fs.mkdir(path.join(game,'mods'),{recursive:true});
  await fs.mkdir(userData,{recursive:true});
  await fs.writeFile(path.join(game,'mods','old.jar'),oldBytes);
  await fs.writeFile(path.join(userData,'modpack-state.json'),JSON.stringify({
    schema:1,version:'0.9.0',managed:{'mods/old.jar':{sha256:HASH(oldBytes),size:oldBytes.length}}
  }));
  const desired=normalizeManifest(manifest({mods:[
    entry('mods','old.jar',newBytes),entry('mods','new.jar',otherBytes)
  ]}));
  const mgr=createModpackManager({
    gameDir:game,userData,getWindow:()=>null,fetchLatest:async()=>({manifest:desired}),
    download:async(asset,cacheDir)=>{
      if(asset.file==='new.jar')return path.join(cacheDir,'absent.jar');
      await fs.mkdir(cacheDir,{recursive:true});
      const local=path.join(cacheDir,'updated-old.jar');
      await fs.writeFile(local,newBytes);
      return local;
    }
  });
  const result=await mgr.install();
  assert.equal(result.phase,'error');
  assert.equal(await fs.readFile(path.join(game,'mods','old.jar'),'utf8'),'Version alt');
  await assert.rejects(fs.stat(path.join(game,'mods','new.jar')),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(userData,'modpack-transaction.json')),{code:'ENOENT'});
});

test('GitHub-API wird als JSON und Release-Dateien als Binärdaten angefragt',()=>{
  const {requestHeaders}=require('../modpack-net');
  assert.equal(requestHeaders('https://api.github.com/repos/LaFamiliaMC/LaFamilia-Modpack/releases/latest').Accept,'application/vnd.github+json');
  assert.equal(requestHeaders(BASE+'manifest.json').Accept,'application/octet-stream');
});
