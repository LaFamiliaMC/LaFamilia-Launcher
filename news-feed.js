'use strict';
const https=require('node:https');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const NEWS_URL='https://raw.githubusercontent.com/LaFamiliaMC/LaFamilia-Launcher/main/data/news.json';
const MAX_BYTES=256*1024;
function normalizeFeed(input){
  if(!input||typeof input!=='object'||input.schema!==1||!Array.isArray(input.news))throw Error('Unbekanntes News-Format.');
  if(input.news.length>200)throw Error('Zu viele News-Einträge.');
  const used=new Set(),normalized=[];
  for(const item of input.news){
    if(!item||typeof item!=='object'||item.visible===false)continue;
    const id=String(item.id||''),title=String(item.title||'').trim(),body=String(item.body||'').trim();
    const date=String(item.date||''),image=String(item.image||'');
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)||used.has(id)||!title||title.length>140
      ||!body||body.length>5000||!/^\d{4}-\d{2}-\d{2}$/.test(date)
      ||!Number.isFinite(Date.parse(date+'T00:00:00Z'))
      ||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date
      ||(image&&!/^assets\/news\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/.test(image))){
      throw Error('Ungültiger News-Eintrag: ID, Titel, Datum, Text oder Bild.');
    }
    used.add(id);
    normalized.push({id,title,body,date,image,pinned:item.pinned===true});
  }
  return normalized.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
function fetchNews(){
  return new Promise((resolve,reject)=>{
    const url=NEWS_URL+'?t='+Date.now()+'-'+randomBytes(3).toString('hex');
    const req=https.get(url,{headers:{Accept:'application/json','Cache-Control':'no-cache','User-Agent':'LaFamilia-News'}},res=>{
      if(res.statusCode!==200){res.resume();reject(Error('GitHub-News HTTP '+res.statusCode));return;}
      let size=0;const chunks=[];
      res.on('data',chunk=>{
        size+=chunk.length;if(size>MAX_BYTES){req.destroy(Error('News-Datei zu groß.'));return;}
        chunks.push(chunk);
      });
      res.on('end',()=>{
        try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
        catch{reject(Error('Ungültige JSON-Antwort von GitHub.'));}
      });
      res.on('error',reject);
    });
    req.setTimeout(8000,()=>req.destroy(Error('GitHub-Nachrichten Zeitüberschreitung.')));
    req.on('error',reject);
  });
}
function createNewsController({cacheFile,getWindow,fetcher=fetchNews,fileSystem=fs}){
  let snapshot={phase:'loading',message:'Neuigkeiten werden geladen …',articles:[],updatedAt:null,error:null};
  let inFlight=null;
  function state(){return {...snapshot,articles:snapshot.articles.map(item=>({...item}))};}
  function send(update){
    snapshot={...snapshot,...update};
    const win=getWindow();
    if(win&&!win.isDestroyed()&&win.webContents&&!win.webContents.isDestroyed()){
      win.webContents.send('news:state',state());
    }
    return state();
  }
  async function initialize(){
    try{
      const cached=JSON.parse(await fileSystem.readFile(cacheFile,'utf8'));
      const articles=normalizeFeed(cached.feed);
      send({phase:'cached',message:'Gespeicherte Neuigkeiten',articles,updatedAt:cached.updatedAt||null,error:null});
    }catch{/* noch kein Cache oder beschädigt */}
    return refresh();
  }
  function refresh(){
    if(inFlight)return inFlight;
    const previousArticles=snapshot.articles;
    const hadCache=snapshot.phase==='cached'||snapshot.phase==='ready';
    send({phase:previousArticles.length?'refreshing':'loading',message:'GitHub-Neuigkeiten werden geprüft …',error:null});
    inFlight=(async()=>{
      try{
        const feed=await fetcher();
        const articles=normalizeFeed(feed);
        const updatedAt=new Date().toISOString();
        try{
          await fileSystem.mkdir(path.dirname(cacheFile),{recursive:true});
          const temp=cacheFile+'.'+process.pid+'.tmp';
          await fileSystem.writeFile(temp,JSON.stringify({feed,updatedAt}),'utf8');
          await fileSystem.rename(temp,cacheFile);
        }catch{/* Keine Speicherung nötig, Onlinewerte bleiben gültig */}
        return send({phase:'ready',articles,updatedAt,error:null,message:articles.length?'Neuigkeiten aktuell':'Noch keine Neuigkeiten veröffentlicht'});
      }catch(error){
        const cached=previousArticles.length>0||hadCache;
        return send({phase:cached?'cached':'error',message:cached?'GitHub derzeit nicht erreichbar · gespeicherte News':'GitHub-News derzeit nicht erreichbar',error:String(error.message||error).slice(0,180)});
      }
    })().finally(()=>{inFlight=null;});
    return inFlight;
  }
  return {initialize,refresh,state};
}
module.exports={NEWS_URL,normalizeFeed,fetchNews,createNewsController};
