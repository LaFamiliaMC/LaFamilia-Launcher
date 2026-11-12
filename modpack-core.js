'use strict';
/* La Familia Fabric 1.21.1 – Manifestprüfung und lokale Dateiplanung. */
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {createReadStream}=require('node:fs');
const {finished}=require('node:stream/promises');
const PACK_REPO='LaFamiliaMC/LaFamilia-Modpack';
const RELEASE_API='https://api.github.com/repos/'+PACK_REPO+'/releases/latest';
const SHA=/^[a-f0-9]{64}$/i;
const FORBIDDEN=/[<>:"|?*\u0000-\u001f\\]/;
const DEVICE=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
function safeRelative(value,category){
  if(typeof value!=='string'||value.length>235||value!==value.normalize('NFC')||FORBIDDEN.test(value)||value.startsWith('/')||value.endsWith('/'))throw Error('Unsicherer Modpack-Pfad.');
  const pieces=value.split('/');
  if(pieces.length<2||pieces[0]!==category||pieces.some(x=>!x||x==='.'||x==='..'||x.endsWith('.')||x.endsWith(' ')||DEVICE.test(x)))throw Error('Unsicherer Modpack-Pfad: '+value);
  if(category==='mods'&&(pieces.length!==2||!pieces[1].toLowerCase().endsWith('.jar')))throw Error('Ungültiger Mod-Dateiname: '+value);
  return value;
}
function trustedAssetURL(value){
  if(typeof value!=='string'||value.length>900)throw Error('Keine sichere Modpack-Downloadadresse.');
  let u;
  try{u=new URL(value);}catch{throw Error('Ungültige Modpack-Downloadadresse.');}
  if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.search||u.hash||u.port)throw Error('Nicht vertrauenswürdiger GitHub-Download.');
  if(!/^\/LaFamiliaMC\/LaFamilia-Modpack\/releases\/download\/modpack-v[0-9]+\.[0-9]+\.[0-9]+\/[^/]+$/i.test(u.pathname))throw Error('Download gehört nicht zum LaFamilia-Modpack-Release.');
  return u.toString();
}

function canonicalizeManifestDownloadUrls(input,release){
  if(!input||typeof input!=='object'||!release||!/^modpack-v\d+\.\d+\.\d+$/.test(String(release.tag_name))||!Array.isArray(release.assets)){
    throw Error('Ungültige Release-Metadaten für Modpack-URLs.');
  }
  const assets=new Map();
  for(const a of release.assets){
    if(typeof a.name!=='string'||typeof a.browser_download_url!=='string')continue;
    trustedAssetURL(a.browser_download_url);
    if(assets.has(a.name))throw Error('Doppelte GitHub-Release-Datei: '+a.name);
    assets.set(a.name,a);
  }
  function fix(item){
    if(!item||typeof item!=='object'||typeof item.url!=='string')return item;
    let u;
    try{u=new URL(item.url);}catch{throw Error('Ungültige URL im Modpack-Manifest.');}
    if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.port||u.search||u.hash)throw Error('Unsichere Modpack-Adresse im Manifest.');
    const prefix='/LaFamiliaMC/LaFamilia-Modpack/releases/download/';
    if(!u.pathname.startsWith(prefix))throw Error('Modpack-Download verweist auf fremdes Repository.');
    const tail=u.pathname.slice(prefix.length).split('/');
    if(tail.length!==2||!tail[1]||/%2f|%5c/i.test(tail[1]))throw Error('Ungültiger Asset-Pfad.');
    const [tag,encodedName]=tail;
    let name;
    try{name=decodeURIComponent(encodedName);}catch{throw Error('Ungültiger Asset-Dateiname.');}
    if(/^untagged-[A-Za-z0-9-]+$/.test(tag)){
      const asset=assets.get(name);
      if(!asset||asset.state!=='uploaded')throw Error('Entwurfslink kann nicht zugeordnet werden: '+name);
      if(asset.size!==item.size||!/^sha256:[a-f0-9]{64}$/i.test(String(asset.digest))
         ||asset.digest.slice(7).toLowerCase()!==String(item.sha256).toLowerCase()){
        throw Error('Dateigröße/Prüfsumme des GitHub-Assets passt nicht: '+name);
      }
      return {...item,url:trustedAssetURL(asset.browser_download_url)};
    }
    trustedAssetURL(item.url);
    // Prüfen, wenn die Datei zum aktuellen Release gehört. Ältere Releases dürfen weiter referenziert werden.
    if(tag===release.tag_name){
      const asset=assets.get(name);
      if(!asset||asset.state!=='uploaded'||asset.size!==item.size
         ||!/^sha256:[a-f0-9]{64}$/i.test(String(asset.digest))
         ||asset.digest.slice(7).toLowerCase()!==String(item.sha256).toLowerCase()){
        throw Error('Release-Datei fehlt oder Prüfsumme abweichend: '+name);
      }
    }
    return item;
  }
  return {
    ...input,
    mods:Array.isArray(input.mods)?input.mods.map(fix):input.mods,
    resourcepacks:input.resourcepacks?{
      ...input.resourcepacks,
      archive:input.resourcepacks.archive?fix(input.resourcepacks.archive):input.resourcepacks.archive
    }:input.resourcepacks,
    config:input.config?{
      ...input.config,
      archive:input.config.archive?fix(input.config.archive):input.config.archive
    }:input.config
  };
}

function validFile(item,category,seen){
  if(!item||typeof item!=='object')throw Error('Eintrag im Manifest fehlt.');
  const rel=safeRelative(item.path,category);
  const key=rel.toLocaleLowerCase('en-US');
  if(seen.has(key))throw Error('Doppelter Modpack-Dateipfad: '+rel);
  seen.add(key);
  if(!Number.isSafeInteger(item.size)||item.size<0||item.size>2147483648||typeof item.sha256!=='string'||!SHA.test(item.sha256))throw Error('Ungültige Dateigröße/Prüfsumme: '+rel);
  if(category==='mods'){
    if(item.file!==rel.slice(5))throw Error('Mod-Dateiname passt nicht zum Pfad: '+rel);
    if(item.size===0)throw Error('Leere Moddatei.');
    trustedAssetURL(item.url);
  }
  return {path:rel,category,size:item.size,sha256:item.sha256.toLowerCase(),...(category==='mods'?{file:item.file,url:item.url}:{})};
}
function validArchive(item,category){
  if(item===null||item===undefined)return null;
  if(typeof item!=='object'||item.file!==category+'.zip'||!Number.isSafeInteger(item.size)||item.size<1||item.size>2147483648||typeof item.sha256!=='string'||!SHA.test(item.sha256))throw Error('Ungültiges ZIP-Paket: '+category);
  trustedAssetURL(item.url);
  return {file:item.file,size:item.size,sha256:item.sha256.toLowerCase(),url:item.url};
}
function normalizeManifest(input){
  if(!input||input.schemaVersion!==2||input.packId!=='la-familia'||input.minecraftVersion!=='1.21.1'||input.modLoader!=='fabric'||!/^([0-9]+\.){2}[0-9]+$/.test(String(input.version)))throw Error('Modpack-Schema/Version ist nicht kompatibel.');
  if(!Array.isArray(input.mods)||input.mods.length>950)throw Error('Ungültige Modliste.');
  const seen=new Set(),mods=input.mods.map(x=>validFile(x,'mods',seen)),groups={};
  let total=mods.reduce((n,x)=>n+x.size,0);
  for(const category of ['resourcepacks','config']){
    const source=input[category];
    if(!source||!Array.isArray(source.files)||source.files.length>20000)throw Error('Ungültiger Bereich: '+category);
    const files=source.files.map(x=>validFile(x,category,seen));
    const archive=validArchive(source.archive,category);
    if(files.length&&!archive)throw Error('Dateien vorhanden, aber ZIP fehlt: '+category);
    if(!files.length&&archive)throw Error('ZIP ohne Manifest-Dateien: '+category);
    total+=files.reduce((n,x)=>n+x.size,0);
    groups[category]={archive,files};
  }
  if(total>12*1024**3)throw Error('Modpack überschreitet die Sicherheitsgrenze.');
  return {schemaVersion:2,packId:'la-familia',minecraftVersion:'1.21.1',modLoader:'fabric',version:input.version,
    mods,resourcepacks:groups.resourcepacks,config:groups.config,all:[...mods,...groups.resourcepacks.files,...groups.config.files]};
}
async function fileHash(file){
  const hash=crypto.createHash('sha256');
  const stream=createReadStream(file);
  stream.on('data',chunk=>hash.update(chunk));
  await finished(stream);
  return hash.digest('hex');
}
async function inspectFile(root,rel){
  // Prüft jeden Pfadbestandteil, damit ein vorhandener Symlink/Junction niemals gefolgt wird.
  let p=root;
  const parts=rel.split('/');
  for(let i=0;i<parts.length;i++){
    const piece=parts[i];
    p=path.join(p,piece);
    let st;
    try{st=await fs.lstat(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    if(st.isSymbolicLink())throw Error('Symlink/Junction im Spielordner nicht unterstützt: '+rel);
    if(i<parts.length-1&&!st.isDirectory())throw Error('Dateipfad enthält eine Datei als Ordner: '+rel);
  }
  const st=await fs.lstat(p);
  if(!st.isFile())throw Error('Ziel ist keine normale Datei: '+rel);
  return {size:st.size,sha256:await fileHash(p)};
}
function normalizedOldState(value){
  if(!value||value.schema!==1||!value.managed||typeof value.managed!=='object')return {schema:1,version:null,managed:{}};
  const managed={};
  for(const [rel,entry] of Object.entries(value.managed)){
    const category=rel.split('/')[0];
    try{
      safeRelative(rel,category);
      if(!['mods','resourcepacks','config'].includes(category)||!SHA.test(entry.sha256))continue;
      managed[rel]={sha256:entry.sha256.toLowerCase(),size:entry.size};
    }catch{continue;}
  }
  return {schema:1,version:String(value.version||''),managed};
}
async function createPlan(manifest,oldState,gameDir){
  const old=normalizedOldState(oldState);
  const pending=[],conflicts=[],unchanged=[],removals=[],adopted=[];
  const desired=new Map(manifest.all.map(f=>[f.path.toLocaleLowerCase('en-US'),f]));
  for(const item of manifest.all){
    let actual;
    try{actual=await inspectFile(gameDir,item.path);}
    catch(error){conflicts.push({path:item.path,reason:error.message});continue;}
    if(actual&&actual.sha256===item.sha256&&actual.size===item.size){
      unchanged.push(item.path);adopted.push(item.path);continue;
    }
    const previous=old.managed[item.path];
    if(!actual){pending.push({...item,action:'add'});continue;}
    if(previous&&previous.sha256===actual.sha256){
      pending.push({...item,action:'replace'});continue;
    }
    conflicts.push({path:item.path,reason:'Vorhandene, eigene oder manuell geänderte Datei wird nicht überschrieben.'});
  }
  for(const [rel,meta] of Object.entries(old.managed)){
    if(desired.has(rel.toLocaleLowerCase('en-US')))continue;
    let actual;
    try{actual=await inspectFile(gameDir,rel);}
    catch(error){conflicts.push({path:rel,reason:error.message});continue;}
    if(actual&&actual.sha256===meta.sha256)removals.push({path:rel,action:'remove'});
    else if(actual)conflicts.push({path:rel,reason:'Frühere Modpack-Datei wurde manuell verändert; bleibt erhalten.'});
  }
  const groups={mods:pending.filter(x=>x.category==='mods').length,
    resourcepacks:pending.filter(x=>x.category==='resourcepacks').length,
    config:pending.filter(x=>x.category==='config').length};
  return {version:manifest.version,pending,removals,conflicts,unchanged,adopted,groups,
    changes:pending.length+removals.length,downloadBytes:pending.filter(x=>x.category==='mods').reduce((n,x)=>n+x.size,0)
      +(groups.resourcepacks?manifest.resourcepacks.archive.size:0)
      +(groups.config?manifest.config.archive.size:0)};
}
module.exports={PACK_REPO,RELEASE_API,normalizeManifest,canonicalizeManifestDownloadUrls,safeRelative,trustedAssetURL,fileHash,inspectFile,normalizedOldState,createPlan};
