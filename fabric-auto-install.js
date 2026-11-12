'use strict';
// Offiziellen FabricMC JAR-Installer mit Minecrafts Java headless ausführen – nur für Minecraft Java 1.21.1.
// Die .jar sowie deren SHA-256 werden ausschließlich vom offiziellen Maven geladen.
const path=require('node:path');
const fs=require('node:fs/promises');
const https=require('node:https');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {MC_VERSION,LOADER_VERSION,FABRIC_VERSION_ID,locateInstallation,installedFabricVersions,launcherProcessRunning}=require('./minecraft-launch');
const runFile=promisify(execFile);
const INSTALLER_VERSION='1.1.2';
const FILENAME='fabric-installer-'+INSTALLER_VERSION+'.jar';
const ARTIFACT_URL='https://maven.fabricmc.net/net/fabricmc/fabric-installer/'+INSTALLER_VERSION+'/'+FILENAME;
const CHECKSUM_URL=ARTIFACT_URL+'.sha256';
const MAX_INSTALLER_BYTES=16*1024*1024;
function verifySource(url){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='maven.fabricmc.net'||u.port||u.username||u.password||u.hash||u.search
    ||![ARTIFACT_URL,CHECKSUM_URL].includes(u.toString()))throw Error('Unzulässige Fabric-Downloadadresse.');
  return u;
}
function downloadBuffer(url,{getter=https.get,maxBytes=MAX_INSTALLER_BYTES,timeoutMs=45000}={}){
  verifySource(url);
  return new Promise((resolve,reject)=>{
    const req=getter(url,{headers:{'User-Agent':'LaFamilia-Launcher/Fabric-Setup','Accept':'application/octet-stream'}},res=>{
      if(res.statusCode!==200){res.resume();reject(Error('FabricMC Download HTTP '+res.statusCode));return;}
      let count=0;
      const data=[];
      res.on('data',buf=>{
        count+=buf.length;
        if(count>maxBytes){res.destroy(Error('FabricMC-Datei zu groß.'));return;}
        data.push(buf);
      });
      res.once('error',reject);
      res.once('end',()=>resolve(Buffer.concat(data)));
    });
    req.setTimeout(timeoutMs,()=>req.destroy(Error('FabricMC-Zeitüberschreitung.')));
    req.once('error',reject);
  });
}
function parseSha256(data){
  const value=Buffer.isBuffer(data)?data.toString('utf8').trim():String(data).trim();
  // Nur Leerzeichen/Tabs vor einem optionalen Dateinamen erlauben, niemals einen zweiten Hash in einer neuen Zeile.
  const match=/^([a-f0-9]{64})(?:[ \t]+\*?[^\r\n]+)?$/i.exec(value);
  if(!match)throw Error('Ungültige offizielle Fabric-SHA-256-Prüfsumme.');
  return match[1].toLowerCase();
}
function checksum(data){return crypto.createHash('sha256').update(data).digest('hex');}
async function obtainInstaller(cacheDir,{fetchFile=downloadBuffer,update=()=>{}}={}){
  await fs.mkdir(cacheDir,{recursive:true});
  update('Prüfe offizielle FabricMC-Prüfsumme …');
  const expected=parseSha256(await fetchFile(CHECKSUM_URL,{maxBytes:512}));
  const jar=path.join(cacheDir,FILENAME);
  let cached;
  try{
    const stat=await fs.lstat(jar);
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=MAX_INSTALLER_BYTES){
      cached=await fs.readFile(jar);
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(cached&&checksum(cached)===expected){update('Fabric Installer vorhanden und verifiziert.');return jar;}
  update('Lade offiziellen Fabric Installer '+INSTALLER_VERSION+' …');
  const data=await fetchFile(ARTIFACT_URL,{maxBytes:MAX_INSTALLER_BYTES});
  if(!data.length||checksum(data)!==expected)throw Error('Fabric Installer SHA-256 stimmt nicht: Installation abgebrochen.');
  const partial=path.join(cacheDir,FILENAME+'.'+process.pid+'.tmp');
  try{
    await fs.writeFile(partial,data,{flag:'wx'});
    // Unter Windows lässt sich eine bereits vorhandene, beschädigte JAR nicht zuverlässig per rename ersetzen.
    await fs.rm(jar,{force:true});
    await fs.rename(partial,jar);
  }catch(error){await fs.rm(partial,{force:true}).catch(()=>{});throw error;}
  return jar;
}
const JAVA_RUNTIMES=['java-runtime-epsilon','java-runtime-delta','java-runtime-gamma','java-runtime-beta'];
async function isRegularJavaFile(file){
  try{const stat=await fs.lstat(file);return stat.isFile()&&!stat.isSymbolicLink();}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
}
// Minecraft liefert auf Windows normalerweise eine eigene Java-Laufzeit mit.
// Nur wenn keine lokale Laufzeit auffindbar ist, wird Java aus PATH verwendet.
async function findJavaExecutable(minecraftRoot,{env=process.env,exists=isRegularJavaFile}={}){
  const storeRoot=env.LOCALAPPDATA
    ? path.join(env.LOCALAPPDATA,'Packages','Microsoft.4297127D64EC6_8wekyb3d8bbwe','LocalCache','Local','minecraft')
    : null;
  const roots=[minecraftRoot,storeRoot,
    env['ProgramFiles(x86)']?path.join(env['ProgramFiles(x86)'],'Minecraft Launcher'):null,
    env.ProgramFiles?path.join(env.ProgramFiles,'Minecraft Launcher'):null].filter(Boolean);
  const arches=process.arch==='arm64'?['windows-arm64','windows-x64']
    :process.arch==='ia32'?['windows-x86']:['windows-x64','windows-x86'];
  for(const root of new Set(roots)){
    for(const arch of arches){
      for(const name of JAVA_RUNTIMES){
        for(const executable of ['java.exe','javaw.exe']){
          const candidate=path.join(root,'runtime',name,arch,name,'bin',executable);
          if(await exists(candidate))return candidate;
        }
      }
    }
  }
  if(env.JAVA_HOME){
    for(const executable of ['java.exe','javaw.exe']){
      const candidate=path.join(env.JAVA_HOME,'bin',executable);
      if(await exists(candidate))return candidate;
    }
  }
  return 'java';
}
async function executeFabricInstaller(jar,root,{run=runFile,findJava=findJavaExecutable}={}){
  const java=await findJava(root);
  const args=['-jar',jar,'client','-dir',root,'-mcversion',MC_VERSION,'-loader',LOADER_VERSION,'-noprofile'];
  try{
    await run(java,args,{windowsHide:true,timeout:240000,maxBuffer:2*1024*1024});
  }catch(error){
    if(error.code==='ENOENT'){
      throw Error('Keine Java-Laufzeit gefunden. Bitte den offiziellen Minecraft Launcher einmal starten, Minecraft 1.21.1 vorbereiten und erneut versuchen.');
    }
    const details=String(error.stderr||error.stdout||error.message).slice(-700);
    throw Error('Offizieller Fabric JAR-Installer konnte nicht abgeschlossen werden: '+details);
  }
  return {java,jar,args};
}
async function ensureFabric({minecraftRoot,userData,update=()=>{},inspect=locateInstallation,
  versions=installedFabricVersions,isLauncherRunning=launcherProcessRunning,
  download=obtainInstaller,execute=executeFabricInstaller}){
  const installation=await inspect(minecraftRoot);
  if(!installation)return {ok:false,code:'no_launcher_profiles',message:'Bitte den offiziellen Minecraft Launcher einmal starten und wieder schließen.'};
  let installed=await versions(installation.root);
  if(installed.includes(FABRIC_VERSION_ID))return {ok:true,code:'already_installed',versionId:FABRIC_VERSION_ID};
  if(await isLauncherRunning())return {ok:false,code:'launcher_running',
    message:'Bitte den offiziellen Minecraft Launcher schließen, damit Fabric sicher installiert werden kann.'};
  update('Fabric Loader '+LOADER_VERSION+' für Minecraft '+MC_VERSION+' fehlt – automatische Installation beginnt …');
  const jar=await download(path.join(userData,'fabric-installer-cache'),{update});
  if(await isLauncherRunning())return {ok:false,code:'launcher_running',
    message:'Minecraft Launcher wurde während des Downloads geöffnet. Bitte schließen und erneut versuchen.'};
  update('Installiere Fabric Loader '+LOADER_VERSION+' für Minecraft '+MC_VERSION+' über den offiziellen Installer …');
  await execute(jar,installation.root);
  installed=await versions(installation.root);
  if(!installed.includes(FABRIC_VERSION_ID))throw Error('Die benötigte Fabric-Version '+FABRIC_VERSION_ID+' wurde nach der Installation nicht erkannt.');
  update('Fabric Loader '+LOADER_VERSION+' für Minecraft '+MC_VERSION+' wurde installiert.');
  return {ok:true,code:'installed',versionId:FABRIC_VERSION_ID};
}
module.exports={INSTALLER_VERSION,FILENAME,ARTIFACT_URL,CHECKSUM_URL,verifySource,
  parseSha256,checksum,downloadBuffer,obtainInstaller,findJavaExecutable,executeFabricInstaller,ensureFabric};
