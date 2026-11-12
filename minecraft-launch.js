'use strict';
// Einrichtung einer eigenständigen Minecraft-Java-Installation über den offiziellen Launcher.
// Keine Mojang-/Microsoft-Token, keine Anmeldung und kein Umgehen des offiziellen Launchers.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
const ID='la-familia-fabric-1-21-1';
const NAME='La Familia – Piraten Update';
const MC_VERSION='1.21.1';
const PROFILE_FILES=['launcher_profiles_microsoft_store.json','launcher_profiles.json'];
const STORE_ROOT=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'Packages','Microsoft.4297127D64EC6_8wekyb3d8bbwe','LocalCache','Local','minecraft');
const FABRIC_HELP_URL='https://fabricmc.net/use/installer/';
function isFabricVersion(id){
  return typeof id==='string'&&/^fabric-loader-[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\.[0-9A-Za-z.-]+)?-1\.21\.1$/.test(id);
}
function numericVersion(id){
  return String(id).replace(/^fabric-loader-/,'').replace(/-1\.21\.1$/,'').split(/[^0-9]+/).map(n=>Number(n)||0);
}
function compareVersions(a,b){
  const p=numericVersion(a),q=numericVersion(b);
  for(let i=0;i<Math.max(p.length,q.length);i++){
    const n=(p[i]||0)-(q[i]||0);
    if(n)return n;
  }
  return a.localeCompare(b);
}
function validRam(ramGb){return Number.isInteger(ramGb)&&ramGb>=2&&ramGb<=24;}
function profileArgs(existing,ramGb){
  if(!validRam(ramGb))throw Error('Ungültige RAM-Einstellung.');
  const base=typeof existing==='string'?existing.trim():'';
  const cleaned=base.replace(/(^|\s)-Xmx\S+/gi,' ').trim();
  return ('-Xmx'+ramGb+'G '+cleaned).trim();
}
function buildProfile({existing,versionId,gameDir,ramGb,now=new Date()}){
  if(!isFabricVersion(versionId))throw Error('Keine kompatible Fabric-Version.');
  if(typeof gameDir!=='string'||!path.isAbsolute(gameDir))throw Error('Ungültiger Spielordner.');
  const prior=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:{};
  return {...prior,type:'custom',name:NAME,created:prior.created||now.toISOString(),
    lastVersionId:versionId,gameDir,javaArgs:profileArgs(prior.javaArgs,ramGb)};
}
async function locateInstallation(minecraftRoot){
  const roots=[minecraftRoot,STORE_ROOT];
  for(const root of roots){
    const files=[];
    for(const name of PROFILE_FILES){
      const file=path.join(root,name);
      try{
        const st=await fs.lstat(file);
        if(st.isFile()&&!st.isSymbolicLink())files.push({file,name});
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(files.length){
      // Bei Microsoft-Store-Installationen ist die Store-Profildatei maßgeblich.
      const selected=files.find(x=>x.name==='launcher_profiles_microsoft_store.json')||files[0];
      return {root,file:selected.file,format:selected.name};
    }
  }
  return null;
}
async function installedFabricVersions(root){
  let entries;
  try{entries=await fs.readdir(path.join(root,'versions'),{withFileTypes:true});}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  const matches=[];
  for(const item of entries){
    if(!item.isDirectory()||!isFabricVersion(item.name))continue;
    const file=path.join(root,'versions',item.name,item.name+'.json');
    try{
      const st=await fs.lstat(file);
      if(st.isSymbolicLink()||!st.isFile()||st.size>1024*1024)continue;
      const info=JSON.parse(await fs.readFile(file,'utf8'));
      if(info.id===item.name)matches.push(item.name);
    }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)continue;throw error;}
  }
  return matches.sort(compareVersions).reverse();
}
async function launcherProcessRunning({runTasklist=execFileAsync}={}){
  if(process.platform!=='win32')return false;
  try{
    const {stdout}=await runTasklist('tasklist.exe',['/FI','IMAGENAME eq MinecraftLauncher.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:8000});
    return /(^|[\r\n])"?MinecraftLauncher\.exe"?[, \t]/i.test(stdout);
  }catch(error){throw Error('Ob der offizielle Minecraft Launcher geöffnet ist, konnte nicht geprüft werden: '+error.message);}
}
async function readLauncherProfiles(file){
  const st=await fs.stat(file);
  if(st.size>16*1024*1024)throw Error('Minecraft-Profildatei ist ungewöhnlich groß.');
  let parsed;
  try{parsed=JSON.parse(await fs.readFile(file,'utf8'));}
  catch{throw Error('Minecraft-Profildatei ist nicht lesbar. Sie wurde nicht verändert.');}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||!parsed.profiles||typeof parsed.profiles!=='object'||Array.isArray(parsed.profiles)){
    throw Error('Minecraft-Profildatei hat ein unbekanntes Format. Keine Änderungen vorgenommen.');
  }
  return parsed;
}
async function prepareProfile({minecraftRoot,gameDir,ramGb,processRunning=launcherProcessRunning}){
  if(!validRam(ramGb))throw Error('RAM-Einstellung außerhalb des gültigen Bereichs.');
  const installation=await locateInstallation(minecraftRoot);
  if(!installation)return {ok:false,code:'no_launcher_profiles',
    message:'Der offizielle Minecraft Launcher muss einmal gestartet und wieder geschlossen werden.'};
  const versions=await installedFabricVersions(installation.root);
  if(!versions.length)return {ok:false,code:'missing_fabric',
    message:'Fabric Loader 1.21.1 fehlt. Bitte den offiziellen Fabric Installer für 1.21.1 ausführen.'};
  const file=installation.file;
  if(await processRunning())return {ok:false,code:'launcher_running',
    message:'Bitte den offiziellen Minecraft Launcher vollständig schließen und danach erneut versuchen.'};
  const data=await readLauncherProfiles(file);
  const profile=buildProfile({existing:data.profiles[ID],versionId:versions[0],gameDir,ramGb});
  const before=JSON.stringify(data.profiles[ID]||null);
  if(before===JSON.stringify(profile))return {ok:true,unchanged:true,versionId:versions[0],
    profileName:NAME,profileFile:file,gameDir};
  // Eine fremde Installation oder Kontodaten werden nicht gezielt verändert.
  data.profiles[ID]=profile;
  const backup=file+'.lafamilia-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  const tmp=file+'.lafamilia-'+process.pid+'.tmp';
  try{
    await fs.copyFile(file,backup,require('node:fs').constants.COPYFILE_EXCL);
    await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    if(await processRunning()){
      await fs.rm(tmp,{force:true});
      return {ok:false,code:'launcher_running',message:'Minecraft Launcher wurde zwischenzeitlich geöffnet. Keine Profile geändert.'};
    }
    await fs.rename(tmp,file);
  }catch(error){
    await fs.rm(tmp,{force:true}).catch(()=>{});
    throw Error('La-Familia-Profil konnte nicht gespeichert werden (Sicherung liegt bei der Profildatei): '+error.message);
  }
  return {ok:true,unchanged:false,versionId:versions[0],profileName:NAME,profileFile:file,gameDir};
}
async function openOfficialLauncher({runSpawn=spawn,checkFile=fs.access}={}){
  if(process.platform!=='win32')throw Error('Die offizielle Minecraft-Launcher-Integration ist für Windows vorgesehen.');
  const possible=[
    process.env['ProgramFiles(x86)']&&path.join(process.env['ProgramFiles(x86)'],'Minecraft Launcher','MinecraftLauncher.exe'),
    process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Minecraft Launcher','MinecraftLauncher.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs','Minecraft Launcher','MinecraftLauncher.exe')
  ].filter(Boolean);
  for(const exe of possible){
    try{
      await checkFile(exe);
      return await spawnLaunch(runSpawn,exe,[]);
    }catch(error){if(error.code!=='ENOENT'&&error.code!=='EACCES')throw error;}
  }
  // Store-Version: über bekannte Windows-App-ID statt flüchtiger WindowsApps-Dateipfade.
  const explorer=path.join(process.env.SystemRoot||'C:\\Windows','explorer.exe');
  return spawnLaunch(runSpawn,explorer,['shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft']);
}
function spawnLaunch(runSpawn,exe,args){
  return new Promise((resolve,reject)=>{
    let child;
    try{child=runSpawn(exe,args,{windowsHide:false,detached:true,stdio:'ignore'});}
    catch(error){reject(error);return;}
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve({requested:true,executable:exe});});
  });
}
module.exports={ID,NAME,MC_VERSION,FABRIC_HELP_URL,isFabricVersion,profileArgs,buildProfile,
  locateInstallation,installedFabricVersions,launcherProcessRunning,prepareProfile,openOfficialLauncher};
