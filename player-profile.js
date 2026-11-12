'use strict';
// Liest ausschließlich öffentliche Minecraft-Profilinformationen, niemals OAuth- oder Login-Tokens.
const fs=require('node:fs/promises');
const path=require('node:path');
const https=require('node:https');
const os=require('node:os');
const UUID=/^[a-f0-9]{32}$/i;
const NAME=/^[a-zA-Z0-9_]{3,16}$/;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const CACHE_MS=15*60*1000;
function normalizeUuid(value){
  const id=typeof value==='string'?value.replace(/-/g,'').toLowerCase():'';
  return UUID.test(id)?id:null;
}
function publicIdentity(id,name){
  const uuid=normalizeUuid(id);
  return uuid&&typeof name==='string'&&NAME.test(name)?{uuid,name}:null;
}
function accountFromModern(data){
  if(!data||typeof data!=='object'||!data.accounts||typeof data.accounts!=='object')return null;
  const key=data.activeAccountLocalId;
  if(typeof key!=='string'||!Object.prototype.hasOwnProperty.call(data.accounts,key))return null;
  const profile=data.accounts[key]?.minecraftProfile;
  return publicIdentity(profile?.id,profile?.name);
}
function accountFromLegacy(data){
  if(!data||typeof data!=='object')return null;
  const selected=data.selectedUser;
  if(!selected||typeof selected!=='object')return null;
  const id=normalizeUuid(selected.profile);
  if(!id)return null;
  const account=data.authenticationDatabase?.[selected.account];
  if(!account||typeof account!=='object')return null;
  const profiles=account.profiles;
  if(profiles&&typeof profiles==='object'){
    for(const [key,value] of Object.entries(profiles)){
      if(normalizeUuid(key)===id){
        const name=typeof value==='string'?value:value?.name;
        return publicIdentity(id,name);
      }
    }
  }
  return publicIdentity(id,account.profile?.name);
}
async function limitedJson(file){
  let stat;
  try{stat=await fs.lstat(file);}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>8*1024*1024)return null;
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch{return null;}
}
async function readActiveAccount({minecraftRoot,localAppData=process.env.LOCALAPPDATA}={}){
  const store=localAppData?path.join(localAppData,'Packages','Microsoft.4297127D64EC6_8wekyb3d8bbwe','LocalCache','Local','minecraft'):null;
  const roots=[minecraftRoot,store].filter(Boolean);
  for(const root of [...new Set(roots)]){
    const modern=accountFromModern(await limitedJson(path.join(root,'launcher_accounts.json')));
    if(modern)return modern;
    for(const profileFile of ['launcher_profiles_microsoft_store.json','launcher_profiles.json']){
      const legacy=accountFromLegacy(await limitedJson(path.join(root,profileFile)));
      if(legacy)return legacy;
    }
  }
  return null;
}
function requestBytes(url,{timeoutMs=10000,maxBytes=512*1024}={}){
  const parsed=new URL(url);
  const session=parsed.hostname==='sessionserver.mojang.com'&&
    /^\/session\/minecraft\/profile\/[0-9a-f]{32}$/.test(parsed.pathname);
  const texture=parsed.hostname==='textures.minecraft.net'&&
    /^\/texture\/[0-9a-f]{32,128}$/.test(parsed.pathname);
  if(parsed.protocol!=='https:'||parsed.port||parsed.username||parsed.password||parsed.hash||
     (!session&&!texture)||parsed.search)throw Error('Unzulässige Profiladresse.');
  return new Promise((resolve,reject)=>{
    const req=https.get(parsed,{headers:{'User-Agent':'LaFamilia-Launcher/Profile','Accept':'application/octet-stream'}},res=>{
      if(res.statusCode!==200){res.resume();reject(Error('Mojang HTTP '+res.statusCode));return;}
      const buffers=[];let size=0;
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>maxBytes){res.destroy(Error('Mojang-Antwort zu groß.'));return;}
        buffers.push(chunk);
      });
      res.once('error',reject);
      res.once('end',()=>resolve(Buffer.concat(buffers)));
    });
    req.setTimeout(timeoutMs,()=>req.destroy(Error('Mojang-Zeitüberschreitung.')));
    req.once('error',reject);
  });
}
function trustedTextureUrl(value){
  if(typeof value!=='string')return null;
  try{
    // Mojang liefert in manchen Skin-Profilen noch http://-URLs; wir erzwingen HTTPS.
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.hostname!=='textures.minecraft.net'||
       url.port||url.username||url.password||url.search||url.hash||
       !/^\/texture\/[a-f0-9]{32,128}$/i.test(url.pathname))return null;
    return 'https://textures.minecraft.net'+url.pathname;
  }catch{return null;}
}
function decodeTextures(body,uuid){
  const data=typeof body==='string'?JSON.parse(body):body;
  if(normalizeUuid(data?.id)!==uuid)throw Error('Mojang hat eine andere Spieler-UUID geliefert.');
  const textureProperty=Array.isArray(data.properties)?
    data.properties.find(item=>item?.name==='textures'&&typeof item.value==='string'):null;
  if(!textureProperty||textureProperty.value.length>32768)throw Error('Keine gültigen Mojang-Spielertexturen gefunden.');
  let decoded;
  try{decoded=JSON.parse(Buffer.from(textureProperty.value,'base64').toString('utf8'));}
  catch{throw Error('Minecraft-Spielertexturen konnten nicht gelesen werden.');}
  if(normalizeUuid(decoded.profileId)!==uuid)throw Error('Skin gehört nicht zum ausgewählten Minecraft-Account.');
  const skin=trustedTextureUrl(decoded.textures?.SKIN?.url);
  const cape=trustedTextureUrl(decoded.textures?.CAPE?.url);
  return {name:NAME.test(data.name||'')?data.name:decoded.profileName,skin,cape,
    model:decoded.textures?.SKIN?.metadata?.model==='slim'?'slim':'classic'};
}
function pngDataUrl(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>512*1024||
     !bytes.subarray(0,8).equals(PNG))throw Error('Mojang-Textur ist keine gültige PNG-Datei.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width<64||width>1024||height<32||height>1024)throw Error('Mojang-Skin hat eine ungültige Größe.');
  return 'data:image/png;base64,'+bytes.toString('base64');
}
function createPlayerProfileController({minecraftRoot,localAppData,readActive=readActiveAccount,
  fetchBytes=requestBytes,clock=()=>Date.now()}={}){
  let cache=null,inFlight=null;
  async function load(force=false){
    const identity=await readActive({minecraftRoot,localAppData});
    if(!identity)return {ok:false,code:'no_account',
      message:'Kein aktives Minecraft-Java-Konto erkannt. Bitte im offiziellen Minecraft Launcher anmelden und „Profil aktualisieren“ klicken.'};
    const {uuid,name}=identity;
    if(!force&&cache?.uuid===uuid&&clock()-cache.loadedAt<CACHE_MS)return {...cache.data};
    try{
      const response=await fetchBytes('https://sessionserver.mojang.com/session/minecraft/profile/'+uuid);
      const official=decodeTextures(response.toString('utf8'),uuid);
      const skinData=official.skin?pngDataUrl(await fetchBytes(official.skin)):null;
      const capeData=official.cape?pngDataUrl(await fetchBytes(official.cape)):null;
      const data={ok:true,code:'ready',name:official.name||name,uuid,model:official.model,
        skinData,capeData,hasCape:Boolean(capeData),source:'mojang',
        stats:{playtime:null,kills:null,blocksPlaced:null,blocksMined:null,quests:null}};
      cache={uuid,loadedAt:clock(),data};
      return {...data};
    }catch(error){
      if(cache?.uuid===uuid)return {...cache.data,code:'cached',cached:true,
        message:'Mojang ist momentan nicht erreichbar – letzter bekannter Skin wird angezeigt.'};
      return {ok:false,code:'lookup_failed',name,uuid,
        message:'Minecraft-Account erkannt, aber Mojangs Skinserver ist nicht erreichbar: '+error.message};
    }
  }
  function refresh(force=false){
    if(inFlight)return inFlight;
    inFlight=load(force).finally(()=>{inFlight=null;});
    return inFlight;
  }
  return {get:()=>refresh(false),refresh:()=>refresh(true)};
}
module.exports={normalizeUuid,publicIdentity,accountFromModern,accountFromLegacy,
  readActiveAccount,requestBytes,trustedTextureUrl,decodeTextures,pngDataUrl,
  createPlayerProfileController};
