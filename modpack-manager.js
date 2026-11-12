'use strict';
/* Modpack V1.3.5 – Prüfung, Download, Backup, Installation und Wiederherstellung. */
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {getLatestManifest,downloadVerified}=require('./modpack-net');
const {createPlan,normalizedOldState,safeRelative,inspectFile,fileHash}=require('./modpack-core');
const {extractVerifiedZip}=require('./modpack-zip');
function createModpackManager({gameDir,userData,getWindow,fetchLatest=getLatestManifest,download=downloadVerified,extract=extractVerifiedZip}){
  if(!gameDir||!userData)throw Error('Spielordner fehlt.');
  const statePath=path.join(userData,'modpack-state.json');
  const journalPath=path.join(userData,'modpack-transaction.json');
  const rollbackDir=path.join(userData,'modpack-rollback');
  const cacheDir=path.join(userData,'modpack-downloads');
  const stageDir=path.join(userData,'modpack-staging');
  let active=null,current=null,lastPlan=null,lastManifest=null,lastAbort=null,lastReport=0;
  let snapshot={
    phase:'idle',message:'Modpack wird vorbereitet …',version:null,installedVersion:null,
    modCount:0,resourcepackCount:0,configCount:0,
    updates:0,pendingMods:0,pendingResourcepacks:0,pendingConfig:0,removals:0,
    conflicts:[],progress:0,downloadedBytes:0,totalBytes:0,updatedAt:null,error:null
  };
  function getState(){return {...snapshot,conflicts:snapshot.conflicts.map(item=>({...item}))};}
  function emit(fields={},force=false){
    snapshot={...snapshot,...fields};
    if(!force&&Date.now()-lastReport<180)return getState();
    lastReport=Date.now();
    const win=getWindow?.();
    if(win&&!win.isDestroyed()&&win.webContents&&!win.webContents.isDestroyed())win.webContents.send('modpack:state',getState());
    return getState();
  }
  async function loadState(){
    try{return normalizedOldState(JSON.parse(await fs.readFile(statePath,'utf8')));}
    catch(error){if(error.code==='ENOENT')return normalizedOldState(null);throw Error('Lokaler Modpack-Status beschädigt: '+error.message);}
  }
  async function writeJSON(file,data){
    await fs.mkdir(path.dirname(file),{recursive:true});
    const temp=file+'.'+process.pid+'.tmp';
    try{await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n','utf8');await fs.rename(temp,file);}
    catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
  }
  async function existsFile(file){
    try{const st=await fs.lstat(file);if(st.isSymbolicLink())throw Error('Symlink im Spielordner blockiert.');return st.isFile();}
    catch(error){if(error.code==='ENOENT')return false;throw error;}
  }
  async function makeParent(rel){
    let current=gameDir;
    const parts=rel.split('/').slice(0,-1);
    for(const piece of parts){
      current=path.join(current,piece);
      try{
        const st=await fs.lstat(current);
        if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsicherer Zielordner: '+rel);
      }catch(error){
        if(error.code!=='ENOENT')throw error;
        await fs.mkdir(current);
      }
    }
  }
  async function restoreJournal(){
    let journal;
    try{journal=JSON.parse(await fs.readFile(journalPath,'utf8'));}
    catch(error){if(error.code==='ENOENT')return;if(error instanceof SyntaxError)throw Error('Wiederherstellungsjournal beschädigt; keine Änderungen möglich.');throw error;}
    if(journal.schema!==1||!['active','committed'].includes(journal.phase)||!Array.isArray(journal.backups))throw Error('Ungültiges Wiederherstellungsjournal.');
    if(journal.phase==='active'){
      emit({phase:'recovering',message:'Unterbrochene Modpack-Installation wird wiederhergestellt …'},true);
      for(const entry of [...journal.backups].reverse()){
        const category=String(entry.rel).split('/')[0];
        safeRelative(entry.rel,category);
        if(!['mods','resourcepacks','config'].includes(category))throw Error('Wiederherstellungsziel ungültig.');
        const target=path.join(gameDir,...entry.rel.split('/'));
        await makeParent(entry.rel);
        if(entry.hadFile){
          const backup=path.join(rollbackDir,'files',String(entry.id)+'.bak');
          await fs.copyFile(backup,target);
        }else await fs.rm(target,{force:true});
      }
      const savedState=path.join(rollbackDir,'old-state.json');
      if(journal.hadState)await fs.copyFile(savedState,statePath);
      else await fs.rm(statePath,{force:true});
    }
    await fs.rm(journalPath,{force:true});
    await fs.rm(rollbackDir,{recursive:true,force:true});
  }
  async function planLatest(){
    await restoreJournal();
    emit({phase:'checking',message:'Vergleiche GitHub-Release und lokale Dateien …',error:null,progress:0},true);
    const remote=await fetchLatest();
    const old=await loadState();
    const plan=await createPlan(remote.manifest,old,gameDir);
    lastPlan=plan;lastManifest=remote.manifest;
    emit({
      phase:plan.changes?'available':plan.conflicts.length?'conflicts':'up-to-date',
      message:plan.changes?'Modpack-Installation oder Update verfügbar':
        plan.conflicts.length?'Einige persönliche Dateien werden geschützt.':'Modpack auf aktuellem Stand',
      version:remote.manifest.version,installedVersion:old.version||null,
      modCount:remote.manifest.mods.length,resourcepackCount:remote.manifest.resourcepacks.files.length,
      configCount:remote.manifest.config.files.length,
      updates:plan.changes,pendingMods:plan.groups.mods,
      pendingResourcepacks:plan.groups.resourcepacks,pendingConfig:plan.groups.config,
      removals:plan.removals.length,conflicts:plan.conflicts.slice(0,100),
      progress:0,downloadedBytes:0,totalBytes:plan.downloadBytes,
      updatedAt:new Date().toISOString(),error:null
    },true);
    return {remote,old,plan};
  }
  function check(){
    if(active)return active;
    active=planLatest().then(()=>getState()).catch(error=>{
      return emit({phase:'error',error:error.message,message:'Modpack-Prüfung fehlgeschlagen: '+error.message},true);
    }).finally(()=>{active=null;});
    return active;
  }
  async function installProcess(){
    const {remote,old,plan}=await planLatest();
    const manifest=remote.manifest;
    if(!plan.changes&&!plan.conflicts.length&&old.version===manifest.version)return emit({phase:'ready',message:'Keine Änderungen erforderlich.',progress:100},true);
    lastAbort=new AbortController();
    const needed=new Map();
    for(const item of plan.pending){
      if(item.category==='mods')needed.set(item.sha256,{file:item.file,size:item.size,sha256:item.sha256,url:item.url});
    }
    for(const category of ['resourcepacks','config']){
      if(plan.groups[category]){const zip=manifest[category].archive;needed.set(zip.sha256,zip);}
    }
    let downloaded=0;
    const total=Array.from(needed.values()).reduce((n,x)=>n+x.size,0);
    emit({phase:'downloading',message:'Modpack-Dateien werden heruntergeladen …',progress:0,
      downloadedBytes:0,totalBytes:total,error:null},true);
    const stored=new Map();
    for(const asset of needed.values()){
      if(lastAbort.signal.aborted)throw Error('Download durch Benutzer abgebrochen.');
      const local=await download(asset,cacheDir,{signal:lastAbort.signal,onProgress:delta=>{
        downloaded+=delta;
        emit({phase:'downloading',downloadedBytes:downloaded,totalBytes:total,
          progress:total?Math.min(95,Math.floor(95*downloaded/total)):95,
          message:'Lade '+asset.file+' …'});
      }});
      stored.set(asset.sha256,local);
    }
    emit({phase:'verifying',message:'Resourcepacks und Config-Dateien werden geprüft …',progress:96},true);
    // ZIPs immer getrennt entpacken. Keine fremden/symlink Dateien erlauben.
    await fs.rm(stageDir,{recursive:true,force:true});
    for(const category of ['resourcepacks','config']){
      if(plan.groups[category]){
        const archive=manifest[category].archive;
        await extract(stored.get(archive.sha256),category,manifest[category].files,
          path.join(stageDir,category));
      }
    }
    // Unmittelbar vor dem Schreiben erneut prüfen: keine zwischenzeitlich veränderten Dateien überschreiben.
    const fresh=await createPlan(manifest,old,gameDir);
    const ids=list=>list.map(e=>e.action+':'+e.path).sort().join('|');
    if(ids(fresh.pending)!==ids(plan.pending)||ids(fresh.removals)!==ids(plan.removals)||ids(fresh.conflicts)!==ids(plan.conflicts))throw Error('Spielordner wurde während des Downloads verändert. Bitte Prüfung erneut starten.');
    const operations=[
      ...plan.removals.map(item=>({rel:item.path,type:'remove',source:null})),
      ...plan.pending.map(item=>({
        rel:item.path,type:'put',
        source:item.category==='mods'?stored.get(item.sha256):
          path.join(stageDir,item.category,...item.path.slice(item.category.length+1).split('/'))
      }))
    ];
    emit({phase:'installing',message:'Verifizierte Modpack-Dateien werden installiert …',progress:97},true);
    await fs.mkdir(gameDir,{recursive:true});
    await fs.rm(rollbackDir,{recursive:true,force:true});
    await fs.mkdir(path.join(rollbackDir,'files'),{recursive:true});
    const backups=[];
    let hadState=false;
    try{
      hadState=await existsFile(statePath);
      if(hadState)await fs.copyFile(statePath,path.join(rollbackDir,'old-state.json'));
      // Jede bestehende Datei vollständig sichern, BEVOR die erste Datei verändert wird.
      for(let i=0;i<operations.length;i++){
        const op=operations[i],target=path.join(gameDir,...op.rel.split('/'));
        await makeParent(op.rel);
        const hadFile=await existsFile(target);
        if(hadFile)await fs.copyFile(target,path.join(rollbackDir,'files',i+'.bak'));
        backups.push({id:i,rel:op.rel,hadFile});
      }
      await writeJSON(journalPath,{schema:1,phase:'active',hadState,backups});
      for(const op of operations){
        const target=path.join(gameDir,...op.rel.split('/'));
        if(op.type==='remove')await fs.rm(target,{force:true});
        else{
          const tmp=target+'.lafamilia-'+process.pid+'.tmp';
          try{
            await fs.copyFile(op.source,tmp);
            await fs.rename(tmp,target);
          }catch(error){await fs.rm(tmp,{force:true}).catch(()=>{});throw error;}
        }
      }
      // Unveränderte und installierte Dateien verwalten. Konflikte behalten den alten Basiswert.
      const managed={...old.managed};
      for(const stale of plan.removals)delete managed[stale.path];
      for(const item of manifest.all){
        if(plan.pending.some(x=>x.path===item.path)||plan.unchanged.includes(item.path)){
          managed[item.path]={sha256:item.sha256,size:item.size};
        }
      }
      await writeJSON(statePath,{schema:1,version:manifest.version,managed,installedAt:new Date().toISOString()});
      await writeJSON(journalPath,{schema:1,phase:'committed',hadState,backups});
      await fs.rm(journalPath,{force:true});
      await fs.rm(rollbackDir,{recursive:true,force:true});
      emit({phase:plan.conflicts.length?'conflicts':'ready',
        message:plan.conflicts.length?
          'Modpack installiert – '+plan.conflicts.length+' eigene Dateien wurden geschützt.':
          'La Familia Modpack '+manifest.version+' erfolgreich installiert',
        installedVersion:manifest.version,updates:0,removals:0,
        pendingMods:0,pendingResourcepacks:0,pendingConfig:0,progress:100,downloadedBytes:total},true);
    }catch(error){
      await restoreJournal();
      throw error;
    }finally{
      lastAbort=null;
    }
    return getState();
  }
  function install(){
    if(active)return active;
    active=installProcess().catch(error=>emit({phase:'error',error:error.message,message:'Installation abgebrochen: '+error.message},true))
      .finally(()=>{active=null;lastAbort=null;});
    return active;
  }
  function cancel(){
    if(lastAbort&&snapshot.phase==='downloading'){
      lastAbort.abort();return {accepted:true};
    }
    return {accepted:false};
  }
  return {getState,check,install,cancel};
}
module.exports={createModpackManager};
