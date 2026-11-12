'use strict';
// Offiziellen FabricMC Windows-Installer headless ausführen – nur für Minecraft Java 1.21.1.
// Die .exe sowie deren SHA-256 werden ausschließlich vom offiziellen Maven geladen.
const path=require('node:path');
const fs=require('node:fs/promises');
const https=require('node:https');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {locateInstallation,installedFabricVersions,launcherProcessRunning}=require('./minecraft-launch');
const runFile=promisify(execFile);
const INSTALLER_VERSION='1.1.2';
const FILENAME='fabric-installer-'+INSTALLER_VERSION+'.exe';
const ARTIFACT_URL='https://maven.fabricmc.net/net/fabricmc/fabric-installer/'+INSTALLER_VERSION+'/'+FILENAME;
const CHECKSUM_URL=ARTIFACT_URL+'.sha256';
const MAX_EXECUTABLE_BYTES=6*1024*1024;
function verifySource(url){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='maven.fabricmc.net'||u.port||u.username||u.password||u.hash||u.search
    ||![ARTIFACT_URL,CHECKSUM_URL].includes(u.toString()))throw Error('Unzulässige Fabric-Downloadadresse.');
  return u;
}
function downloadBuffer(url,{getter=https.get,maxBytes=MAX_EXECUTABLE_BYTES,timeoutMs=45000}={}){
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
  const match=/^([a-f0-9]{64})(?:\s+[*]?[^\r\n]+)?$/i.exec(value);
  if(!match)throw Error('Ungültige offizielle Fabric-SHA-256-Prüfsumme.');
  return match[1].toLowerCase();
}
function checksum(data){return crypto.createHash('sha256').update(data).digest('hex');}
async function obtainInstaller(cacheDir,{fetchFile=downloadBuffer,update=()=>{}}={}){
  await fs.mkdir(cacheDir,{recursive:true});
  update('Prüfe offizielle FabricMC-Prüfsumme …');
  const expected=parseSha256(await fetchFile(CHECKSUM_URL,{maxBytes:512}));
  const exe=path.join(cacheDir,FILENAME);
  let cached;
  try{
    const stat=await fs.lstat(exe);
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=MAX_EXECUTABLE_BYTES){
      cached=await fs.readFile(exe);
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(cached&&checksum(cached)===expected){update('Fabric Installer vorhanden und verifiziert.');return exe;}
  update('Lade offiziellen Fabric Installer '+INSTALLER_VERSION+' …');
  const data=await fetchFile(ARTIFACT_URL,{maxBytes:MAX_EXECUTABLE_BYTES});
  if(!data.length||checksum(data)!==expected)throw Error('Fabric Installer SHA-256 stimmt nicht: Installation abgebrochen.');
  const partial=path.join(cacheDir,FILENAME+'.'+process.pid+'.tmp');
  try{
    await fs.writeFile(partial,data,{flag:'wx'});
    // Unter Windows lässt sich eine bereits vorhandene, beschädigte EXE nicht zuverlässig per rename ersetzen.
    await fs.rm(exe,{force:true});
    await fs.rename(partial,exe);
  }catch(error){await fs.rm(partial,{force:true}).catch(()=>{});throw error;}
  return exe;
}
async function executeFabricInstaller(exe,root,{run=runFile}={}){
  const args=['client','-dir',root,'-mcversion','1.21.1','-noprofile'];
  try{
    await run(exe,args,{windowsHide:true,timeout:240000,maxBuffer:1024*1024});
  }catch(error){
    const details=String(error.stderr||error.stdout||error.message).slice(-700);
    throw Error('Offizieller Fabric Installer konnte nicht abgeschlossen werden: '+details);
  }
  return {exe,args};
}
async function ensureFabric({minecraftRoot,userData,update=()=>{},inspect=locateInstallation,
  versions=installedFabricVersions,isLauncherRunning=launcherProcessRunning,
  download=obtainInstaller,execute=executeFabricInstaller}){
  const installation=await inspect(minecraftRoot);
  if(!installation)return {ok:false,code:'no_launcher_profiles',message:'Bitte den offiziellen Minecraft Launcher einmal starten und wieder schließen.'};
  let installed=await versions(installation.root);
  if(installed.length)return {ok:true,code:'already_installed',versionId:installed[0]};
  if(await isLauncherRunning())return {ok:false,code:'launcher_running',
    message:'Bitte den offiziellen Minecraft Launcher schließen, damit Fabric sicher installiert werden kann.'};
  update('Fabric Loader 1.21.1 fehlt – automatische Installation beginnt …');
  const exe=await download(path.join(userData,'fabric-installer-cache'),{update});
  if(await isLauncherRunning())return {ok:false,code:'launcher_running',
    message:'Minecraft Launcher wurde während des Downloads geöffnet. Bitte schließen und erneut versuchen.'};
  update('Installiere Fabric Loader 1.21.1 über den offiziellen Installer …');
  await execute(exe,installation.root);
  installed=await versions(installation.root);
  if(!installed.length)throw Error('Fabric wurde nicht erkannt. Bitte prüfen, ob der offizielle Installer erfolgreich war.');
  update('Fabric Loader 1.21.1 wurde installiert.');
  return {ok:true,code:'installed',versionId:installed[0]};
}
module.exports={INSTALLER_VERSION,FILENAME,ARTIFACT_URL,CHECKSUM_URL,verifySource,
  parseSha256,checksum,downloadBuffer,obtainInstaller,executeFabricInstaller,ensureFabric};
