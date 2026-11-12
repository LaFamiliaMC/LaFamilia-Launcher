'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises');
const m=require('../fabric-auto-install');
const bytes=Buffer.from('mock-fabric-installer');
async function tmp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'lafam-fabric-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('Nur verifizierte offizielle Maven-Adresse ist zugelassen',()=>{
  assert.ok(m.verifySource(m.ARTIFACT_URL));assert.ok(m.verifySource(m.CHECKSUM_URL));
  assert.throws(()=>m.verifySource('https://other.example/installer.exe'));
  assert.throws(()=>m.verifySource(m.ARTIFACT_URL+'?evil=1'));
});
test('SHA256-Parser lehnt ungültige oder mehrere Hashes ab',()=>{
  assert.equal(m.parseSha256(m.checksum(bytes)),m.checksum(bytes));
  assert.throws(()=>m.parseSha256('123'),/SHA-256/);
  assert.throws(()=>m.parseSha256('a'.repeat(64)+'\n'+'b'.repeat(64)),/SHA-256/);
});
test('Verifizierter Download wird wiederverwendet',async t=>{
  const dir=await tmp(t),calls=[];
  const fetchFile=async url=>{calls.push(url);return url===m.CHECKSUM_URL?Buffer.from(m.checksum(bytes)):bytes;};
  const file=await m.obtainInstaller(dir,{fetchFile});
  assert.deepEqual(await fs.readFile(file),bytes);
  await m.obtainInstaller(dir,{fetchFile});
  assert.equal(calls.filter(v=>v===m.ARTIFACT_URL).length,1);
});
test('Hash-Abweichung verhindert EXE-Installation',async t=>{
  const dir=await tmp(t);
  await assert.rejects(m.obtainInstaller(dir,{fetchFile:async url=>url===m.CHECKSUM_URL?Buffer.from('f'.repeat(64)):bytes}),/SHA-256 stimmt nicht/);
  await assert.rejects(fs.stat(path.join(dir,m.FILENAME)),{code:'ENOENT'});
});
test('Fabric JAR-CLI nutzt Java und installiert genau Client 1.21.1/0.19.5 ohne extra Profil',async()=>{
  let opts;
  await m.executeFabricInstaller('C:\\Tools\\fabric-installer.jar','C:\\Minecraft',{
    findJava:async()=> 'C:\\Minecraft\\runtime\\java.exe',
    run:async(exe,args,params)=>{opts={exe,args,params};return {stdout:'ok'};}
  });
  assert.equal(opts.exe,'C:\\Minecraft\\runtime\\java.exe');
  assert.deepEqual(opts.args,['-jar','C:\\Tools\\fabric-installer.jar','client','-dir','C:\\Minecraft','-mcversion','1.21.1','-loader','0.19.5','-noprofile']);
  assert.equal(opts.params.windowsHide,true);
});
test('Minecrafts gebündeltes Java hat Vorrang vor JAVA_HOME und PATH',async t=>{
  const root=await tmp(t);
  const java=path.join(root,'runtime','java-runtime-delta','windows-x64','java-runtime-delta','bin','java.exe');
  await fs.mkdir(path.dirname(java),{recursive:true});
  await fs.writeFile(java,'test');
  if(process.arch==='arm64'||process.arch==='ia32')return;
  assert.equal(await m.findJavaExecutable(root,{env:{JAVA_HOME:path.join(root,'andere-java')}}),java);
});
test('JAVA_HOME wird genutzt, falls Minecraft-Java noch fehlt',async t=>{
  const root=await tmp(t),home=path.join(root,'jdk');
  const java=path.join(home,'bin','java.exe');
  await fs.mkdir(path.dirname(java),{recursive:true});
  await fs.writeFile(java,'test');
  assert.equal(await m.findJavaExecutable(path.join(root,'ohne-runtime'),{env:{JAVA_HOME:home}}),java);
});
test('Vorhandenes Fabric wird nicht neu installiert',async()=>{
  let requests=0;
  const result=await m.ensureFabric({minecraftRoot:'root',userData:'cache',
    inspect:async()=>({root:'root'}),versions:async()=>['fabric-loader-0.17.3-1.21.1','fabric-loader-0.19.5-1.21.1'],
    download:async()=>{requests++;}});
  assert.equal(result.code,'already_installed');assert.equal(requests,0);
});
test('Fehlendes Fabric wird genau einmal nachgeladen',async()=>{
  let calls=0,installed=false;
  const result=await m.ensureFabric({minecraftRoot:'root',userData:'cache',
    inspect:async()=>({root:'root'}),versions:async()=>installed?['fabric-loader-0.19.5-1.21.1']:['fabric-loader-0.17.3-1.21.1'],
    isLauncherRunning:async()=>false,download:async()=>{calls++;return 'test.exe';},
    execute:async()=>{installed=true;}});
  assert.equal(result.code,'installed');assert.equal(result.versionId,'fabric-loader-0.19.5-1.21.1');assert.equal(calls,1);
});
test('Geöffneter Minecraft Launcher und fehlendes Profil blockieren Installation',async()=>{
  const base={minecraftRoot:'root',userData:'cache',versions:async()=>[],download:async()=>{throw Error('Nicht herunterladen.');}};
  assert.equal((await m.ensureFabric({...base,inspect:async()=>null})).code,'no_launcher_profiles');
  assert.equal((await m.ensureFabric({...base,inspect:async()=>({root:'root'}),isLauncherRunning:async()=>true})).code,'launcher_running');
});
test('Fehlende Fabric-Version nach Installer-Ausführung führt zu Fehler',async()=>{
  await assert.rejects(m.ensureFabric({minecraftRoot:'root',userData:'cache',
    inspect:async()=>({root:'root'}),versions:async()=>[],isLauncherRunning:async()=>false,
    download:async()=>'test.exe',execute:async()=>{}}),/wurde nach der Installation nicht erkannt/);
});

test('Falsche Loader-Version nach Installer-Lauf wird abgelehnt',async()=>{
  await assert.rejects(m.ensureFabric({minecraftRoot:'root',userData:'cache',
    inspect:async()=>({root:'root'}),versions:async()=>['fabric-loader-0.19.4-1.21.1'],
    isLauncherRunning:async()=>false,download:async()=>'test.exe',execute:async()=>{}}),
    /fabric-loader-0\.19\.5-1\.21\.1/);
});
test('Vorhandener fremder Fabric Loader wird nicht ersetzt, aber Zielversion nachinstalliert',async()=>{
  let calls=0;
  const required='fabric-loader-0.19.5-1.21.1';
  const result=await m.ensureFabric({minecraftRoot:'root',userData:'cache',
    inspect:async()=>({root:'root'}),versions:async()=>calls?[required,'fabric-loader-0.19.4-1.21.1']:['fabric-loader-0.19.4-1.21.1'],
    isLauncherRunning:async()=>false,download:async()=> 'test.exe',execute:async()=>{calls++;}});
  assert.equal(result.versionId,required);
  assert.equal(calls,1);
});
