'use strict';
// Fabric Spielerstatistiken: geschützte Abfrage im Electron-Hauptprozess.
// Das Verbindungsgeheimnis wird weder im HTML noch in Logs/IPCs zurückgegeben.
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const https=require('node:https');
const {normalizeUuid}=require('./player-profile');

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const MAX_BODY=16384;
function normalizePlayerUuid(raw){
  const normalized=normalizeUuid(raw);
  return normalized?normalized.slice(0,8)+'-'+normalized.slice(8,12)+'-'+normalized.slice(12,16)+'-'+normalized.slice(16,20)+'-'+normalized.slice(20):null;
}
function validatePlayerStatsUrl(value){
  if(typeof value!=='string'||value.trim().length>500)throw Error('Bitte eine gültige Statistik-Adresse eintragen.');
  let u;try{u=new URL(value.trim());}catch{throw Error('Statistik-Adresse muss eine vollständige URL sein.');}
  if(u.username||u.password||u.hash||u.search||!u.hostname)throw Error('Statistik-Adresse darf keine Zugangsdaten oder Parameter enthalten.');
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname.toLowerCase());
  if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))
    throw Error('Aus Sicherheitsgründen wird HTTPS benötigt. HTTP ist nur für localhost erlaubt.');
  if(u.pathname!=='/status'&&u.pathname!=='/'&&u.pathname!=='/status/')
    throw Error('Bitte die Serveradresse mit /status angeben.');
  u.pathname='/status';
  return u.toString();
}
function playerStatsEndpoint(statusUrl,uuid){
  const u=new URL(validatePlayerStatsUrl(statusUrl));
  const id=normalizePlayerUuid(uuid);
  if(!id)throw Error('Minecraft-Spieler-ID ist ungültig.');
  u.pathname='/player/'+id;
  return u.toString();
}
function validateStatsResponse(json,uuid){
  if(!json||typeof json!=='object'||Array.isArray(json)||json.schema!==1||
    normalizePlayerUuid(json.uuid)!==normalizePlayerUuid(uuid))
    throw Error('Spielerstatistiken passen nicht zum ausgewählten Minecraft-Spieler.');
  const allowed=(key,nullable=false)=>{
    const n=json[key];if(nullable&&n===null)return null;
    if(!Number.isSafeInteger(n)||n<0||n>2_147_483_647)
      throw Error('Ungültige Spielerstatistik: '+key);
    return n;
  };
  if(typeof json.online!=='boolean')throw Error('Serverstatus der Spielerstatistiken fehlt.');
  return {
    uuid:normalizePlayerUuid(uuid),
    online:json.online,
    playTimeTicks:allowed('playTimeTicks'),
    deaths:allowed('deaths'),mobKills:allowed('mobKills'),
    playerKills:allowed('playerKills'),blocksMined:allowed('blocksMined'),
    mcLevel:allowed('mcLevel',true),
    blocksPlaced:null,rank:null,quests:null
  };
}
function requestStats(url,token,uuid,{timeoutMs=5000}={}){
  if(!TOKEN.test(token))throw Error('Ungültiger persönlicher Statistik-Schlüssel.');
  const endpoint=playerStatsEndpoint(url,uuid),target=new URL(endpoint);
  return new Promise((resolve,reject)=>{
    let finished=false;
    const settle=(err,data)=>{
      if(finished)return;finished=true;
      if(err)reject(err);else resolve(data);
    };
    const req=(target.protocol==='https:'?https:http).get(endpoint,{
      headers:{Accept:'application/json',Authorization:'Bearer '+token},
      agent:false
    },res=>{
      if(res.statusCode!==200){
        res.resume();
        const reason=res.statusCode===401?'Schlüssel ungültig oder widerrufen. Bitte im Spiel /lfstats link verwenden.':
          res.statusCode===404?'Für diesen Spieler liegen noch keine gespeicherten Serverstatistiken vor.':
          res.statusCode===503?'Die Statistik-Schnittstelle auf dem Server ist deaktiviert oder ausgelastet.':
          'Statistik-Server antwortet mit HTTP '+res.statusCode;
        settle(Error(reason));return;
      }
      const chunks=[];let size=0;
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>MAX_BODY){req.destroy(Error('Statistik-Antwort zu groß.'));return;}
        chunks.push(chunk);
      });
      res.once('error',settle);
      res.once('end',()=>{
        try{
          settle(null,validateStatsResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')),uuid));
        }catch(error){settle(error);}
      });
    });
    req.setTimeout(Math.max(500,Math.min(10000,timeoutMs)),()=>req.destroy(Error('Statistik-Server antwortet nicht rechtzeitig.')));
    req.once('error',error=>settle(Error('Statistik-Verbindung fehlgeschlagen: '+error.message)));
  });
}
function createPlayerStatsController({file,fetchStats=requestStats}){
  if(typeof file!=='string'||!file)throw Error('Profil-Speicherort fehlt.');
  async function read(){
    try{
      const stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2048)throw Error('Statistik-Konfiguration ungültig.');
      const raw=JSON.parse(await fs.readFile(file,'utf8'));
      if(!raw||typeof raw!=='object')throw Error('Statistik-Konfiguration ungültig.');
      return {
        url:typeof raw.url==='string'?validatePlayerStatsUrl(raw.url):'',
        token:typeof raw.token==='string'&&TOKEN.test(raw.token)?raw.token:'',
        uuid:normalizePlayerUuid(raw.uuid)
      };
    }catch(error){
      if(error.code==='ENOENT')return {url:'',token:'',uuid:null};
      throw error;
    }
  }
  async function write(value){
    await fs.mkdir(path.dirname(file),{recursive:true});
    const temporary=file+'.'+process.pid+'.tmp';
    try{
      await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'w'});
      await fs.rename(temporary,file);
      await fs.chmod(file,0o600).catch(()=>{});
    }catch(error){await fs.rm(temporary,{force:true}).catch(()=>{});throw error;}
  }
  async function info(){
    const s=await read();
    return {url:s.url,linkedUuid:s.uuid,hasToken:Boolean(s.token)};
  }
  async function connect({url,token,uuid}={}){
    const id=normalizePlayerUuid(uuid);
    if(!id)throw Error('Erst ein gültiges Minecraft-Spielerprofil auswählen.');
    const safeUrl=validatePlayerStatsUrl(url);
    if(typeof token!=='string'||!TOKEN.test(token.trim()))
      throw Error('Der Statistik-Schlüssel aus /lfstats link ist ungültig.');
    await write({url:safeUrl,uuid:id,token:token.trim()});
    return info();
  }
  async function disconnect(){
    await fs.rm(file,{force:true});return info();
  }
  async function getStats(uuid){
    const id=normalizePlayerUuid(uuid);
    if(!id)return {ok:false,code:'no_profile',message:'Bitte zuerst dein Minecraft-Spielerprofil laden.'};
    try{
      const config=await read();
      if(!config.token||!config.url)return {ok:false,code:'unlinked',
        message:'Noch nicht mit dem Minecraft-Server verbunden. Im Spiel /lfstats link ausführen und den Schlüssel hier eintragen.'};
      if(config.uuid!==id)return {ok:false,code:'different_player',
        message:'Die gespeicherte Statistik-Verknüpfung gehört zu einem anderen Minecraft-Profil.'};
      const stats=await fetchStats(config.url,config.token,id);
      return {ok:true,code:'ready',stats};
    }catch(error){
      return {ok:false,code:'failed',message:String(error.message||error).slice(0,220)};
    }
  }
  return {info,connect,disconnect,getStats};
}
module.exports={normalizePlayerUuid,validatePlayerStatsUrl,playerStatsEndpoint,
  validateStatsResponse,requestStats,createPlayerStatsController};
