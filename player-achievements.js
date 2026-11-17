'use strict';

// Private Minecraft advancements use the existing /lfstats link token.
// Never send the bearer secret to the renderer, query string or logs.
const http=require('node:http');
const https=require('node:https');
const {normalizePlayerUuid,validatePlayerStatsUrl}=require('./player-stats');

const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const MAX_BODY=32768;
const IDENTIFIER=/^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function advancementsEndpoint(statusUrl,uuid) {
  const id=normalizePlayerUuid(uuid);
  if(!id)throw Error('Minecraft-Spieler-ID ist ungültig.');
  const url=new URL(validatePlayerStatsUrl(statusUrl));
  url.pathname='/player/'+id+'/advancements';
  return url.toString();
}

function validateAchievementsResponse(json,uuid) {
  if(!json||typeof json!=='object'||Array.isArray(json)||
    json.schema!==1||normalizePlayerUuid(json.uuid)!==normalizePlayerUuid(uuid))
    throw Error('Erfolge passen nicht zum ausgewählten Minecraft-Profil.');
  if(typeof json.available!=='boolean'||typeof json.online!=='boolean'||
    !['live','saved','not_saved'].includes(json.source)||
    !Number.isSafeInteger(json.completed)||json.completed<0||json.completed>100000||
    !Array.isArray(json.items)||json.items.length>40||json.items.length>json.completed)
    throw Error('Die Erfolgsdaten sind ungültig.');
  if(!json.available&&(json.completed!==0||json.items.length!==0||json.source!=='not_saved'))
    throw Error('Erfolgsdaten sind widersprüchlich.');
  const ids=new Set();
  const items=json.items.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||
      item.id.length>150||!IDENTIFIER.test(item.id)||ids.has(item.id)||
      typeof item.title!=='string'||item.title.length>120||
      item.title.trim().length===0||
      (item.obtainedAt!==null&&(typeof item.obtainedAt!=='string'||
        item.obtainedAt.length>40||Number.isNaN(Date.parse(item.obtainedAt)))))
      throw Error('Ungültiger Erfolgseintrag vom Server.');
    ids.add(item.id);
    return {id:item.id,title:item.title,obtainedAt:item.obtainedAt};
  });
  return {
    uuid:normalizePlayerUuid(uuid),available:json.available,online:json.online,
    completed:json.completed,source:json.source,items
  };
}

function requestAchievements(url,token,uuid,{timeoutMs=5000}={}){
  if(!TOKEN.test(token))throw Error('Ungültiger persönlicher Statistik-Schlüssel.');
  const endpoint=advancementsEndpoint(url,uuid);
  const target=new URL(endpoint);
  return new Promise((resolve,reject)=>{
    let finished=false;
    function settle(err,value) {
      if(finished)return;finished=true;
      if(err)reject(err);else resolve(value);
    }
    const req=(target.protocol==='https:'?https:http).get(endpoint,{
      headers:{Accept:'application/json',Authorization:'Bearer '+token},
      agent:false
    },res=>{
      if(res.statusCode!==200){
        res.resume();
        const reason=res.statusCode===401?
          'Schlüssel ungültig oder widerrufen. Bitte im Spiel /lfstats link verwenden.':
          res.statusCode===404?
          'Der Server bietet noch keine Erfolgsschnittstelle. Bitte die aktuelle Servermod installieren.':
          res.statusCode===503?
          'Erfolge können derzeit nicht vom Minecraft-Server gelesen werden.':
          'Erfolgsserver antwortet mit HTTP '+res.statusCode;
        settle(Error(reason));return;
      }
      const chunks=[];let size=0;
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>MAX_BODY){req.destroy(Error('Erfolgsdaten sind zu groß.'));return;}
        chunks.push(chunk);
      });
      res.once('error',settle);
      res.once('end',()=>{
        try{settle(null,validateAchievementsResponse(
          JSON.parse(Buffer.concat(chunks).toString('utf8')),uuid));}
        catch(error){settle(error);}
      });
    });
    req.setTimeout(Math.max(500,Math.min(10000,timeoutMs)),
      ()=>req.destroy(Error('Erfolgsserver antwortet nicht rechtzeitig.')));
    req.once('error',error=>settle(Error('Verbindung zum Erfolgsserver fehlgeschlagen: '+error.message)));
  });
}

module.exports={advancementsEndpoint,validateAchievementsResponse,requestAchievements};
