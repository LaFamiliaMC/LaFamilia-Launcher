'use strict';
/* GitHub-Verbindung, geschützte Downloads und SHA-256-Verifizierung. */
const https=require('node:https');
const path=require('node:path');
const fs=require('node:fs/promises');
const {createWriteStream}=require('node:fs');
const crypto=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {normalizeManifest,RELEASE_API,trustedAssetURL,fileHash}=require('./modpack-core');
function trustedTransport(url,first){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Unsichere Download-Weiterleitung.');
  if(first){
    if(u.toString()!==RELEASE_API&&u.toString()!==trustedAssetURL(url))throw Error('Nicht erlaubte Downloadadresse.');
  }else if(!['github.com','api.github.com'].includes(u.hostname)
    && !u.hostname.endsWith('.githubusercontent.com')){
    throw Error('GitHub-Weiterleitung auf fremden Server blockiert: '+u.hostname);
  }
  return u;
}
function requestHeaders(url){
  // GitHub REST benötigt JSON-Medientyp; herunterladbare Release-Assets sind dagegen Binärdaten.
  const api=new URL(url).hostname==='api.github.com';
  return {
    'User-Agent':'LaFamilia-Launcher/1.3.5',
    'Accept':api?'application/vnd.github+json':'application/octet-stream',
    ...(api?{'X-GitHub-Api-Version':'2022-11-28'}:{})
  };
}
function requestStream(url,{signal,timeoutMs=45000,maxRedirects=6}={}){
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(err,res)=>{if(finished)return;finished=true;if(err)reject(err);else resolve(res);};
    const attempt=(address,redirects)=>{
      let target;
      try{target=trustedTransport(address,redirects===0);}catch(error){finish(error);return;}
      const req=https.get(target,{headers:requestHeaders(target.toString())},res=>{
        const status=res.statusCode||0;
        if([301,302,303,307,308].includes(status)){
          const next=res.headers.location;
          res.resume();
          if(redirects>=maxRedirects||!next){finish(Error('Zu viele/ungültige GitHub-Weiterleitungen.'));return;}
          let full;
          try{full=new URL(next,target).toString();}catch(error){finish(error);return;}
          attempt(full,redirects+1);
          return;
        }
        if(status!==200){
          res.resume();finish(Error('GitHub HTTP '+status+' beim '+(target.hostname==='api.github.com'?'Abruf der Release-Informationen':'Download einer Release-Datei')+'.'));return;
        }
        finish(null,res);
      });
      req.setTimeout(timeoutMs,()=>req.destroy(Error('GitHub-Download hat zu lange nicht geantwortet.')));
      req.on('error',finish);
      if(signal){
        if(signal.aborted){req.destroy(Error('Download abgebrochen.'));return;}
        signal.addEventListener('abort',()=>req.destroy(Error('Download abgebrochen.')),{once:true});
      }
    };
    attempt(url,0);
  });
}
async function getBuffer(url,{maxBytes=4*1024*1024,signal}={}){
  const stream=await requestStream(url,{signal});
  const chunks=[];let count=0;
  for await(const chunk of stream){
    count+=chunk.length;
    if(count>maxBytes){stream.destroy();throw Error('GitHub-Antwort größer als erlaubt.');}
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function sha(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
async function getLatestManifest({signal}={}){
  let release;
  try{release=JSON.parse((await getBuffer(RELEASE_API,{maxBytes:2*1024*1024,signal})).toString('utf8'));}
  catch(error){throw Error('Modpack-Release nicht erreichbar: '+error.message);}
  if(release.draft||release.prerelease||!/^modpack-v[0-9]+\.[0-9]+\.[0-9]+$/.test(release.tag_name))throw Error('Kein gültiges öffentliches LaFamilia-Modpack-Release.');
  const asset=Array.isArray(release.assets)?release.assets.find(x=>x.name==='manifest.json'&&x.state==='uploaded'):null;
  if(!asset||!asset.browser_download_url||asset.size>4*1024*1024)throw Error('Das Release hat kein gültiges manifest.json.');
  trustedAssetURL(asset.browser_download_url);
  const buffer=await getBuffer(asset.browser_download_url,{maxBytes:4*1024*1024,signal});
  if(buffer.length!==asset.size)throw Error('Unvollständige Manifest-Datei.');
  if(typeof asset.digest==='string'&&/^sha256:[a-f0-9]{64}$/i.test(asset.digest)&&sha(buffer)!==asset.digest.slice(7).toLowerCase())throw Error('Manifest SHA-256 stimmt nicht.');
  let manifest;
  try{manifest=normalizeManifest(JSON.parse(buffer.toString('utf8')));}catch(error){throw Error('Ungültiges Modpack-Manifest: '+error.message);}
  if('modpack-v'+manifest.version!==release.tag_name)throw Error('Manifestversion passt nicht zum GitHub Release.');
  return {manifest,manifestSha256:sha(buffer),publishedAt:release.published_at||null,releaseUrl:release.html_url};
}
async function downloadVerified(asset,cacheDir,{signal,onProgress}={}){
  if(!asset||!asset.sha256||!Number.isSafeInteger(asset.size)||asset.size<1)throw Error('Ungültiger Download-Eintrag.');
  trustedAssetURL(asset.url);
  await fs.mkdir(cacheDir,{recursive:true});
  const destination=path.join(cacheDir,asset.sha256+'.asset');
  try{
    const stats=await fs.stat(destination);
    if(stats.isFile()&&stats.size===asset.size&&(await fileHash(destination))===asset.sha256){
      onProgress?.(asset.size);
      return destination;
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const temp=destination+'.'+process.pid+'.partial';
  let bytes=0;const hash=crypto.createHash('sha256');
  try{
    const response=await requestStream(asset.url,{signal,timeoutMs:60000});
    const meter=new Transform({
      transform(chunk,_encoding,callback){
        bytes+=chunk.length;
        if(bytes>asset.size){callback(Error('Download ist größer als im Manifest.'));return;}
        hash.update(chunk);onProgress?.(chunk.length);callback(null,chunk);
      }
    });
    await pipeline(response,meter,createWriteStream(temp,{flags:'w'}),{signal});
    if(bytes!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('Download beschädigt: Größe/SHA-256 stimmt nicht ('+asset.file+').');
    await fs.rename(temp,destination);
    return destination;
  }catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
}
module.exports={trustedTransport,requestHeaders,requestStream,getBuffer,getLatestManifest,downloadVerified};
