'use strict';

// Offizielle La-Familia-Weltkarte. Der URL wird niemals durch Renderer-Argumente
// ersetzt: kein frei verwendbarer Netzwerk-Proxy oder beliebiger externer Link.
const https = require('node:https');
const MAP_URL = 'https://23.88.65.87/map/';
const MAP_TIMEOUT_MS = 5000;
const MAX_PREVIEW_BYTES = 128 * 1024;

function inspectMapResponse(statusCode, contentType, html) {
  if (statusCode !== 200) {
    if (statusCode === 404) return {ready:false,code:'missing',message:'Noch keine Weltkarte unter /map/ veröffentlicht.'};
    if (statusCode === 502 || statusCode === 503 || statusCode === 504)
      return {ready:false,code:'unavailable',message:'BlueMap läuft noch nicht oder ist über Caddy nicht erreichbar.'};
    return {ready:false,code:'http_error',message:'Kartenserver antwortet mit HTTP '+statusCode+'.'};
  }
  if (!/text\/html/i.test(contentType || '') || !/bluemap/i.test(String(html || ''))) {
    return {ready:false,code:'unexpected',message:'Unter /map/ wird noch keine BlueMap-Karte ausgeliefert.'};
  }
  return {ready:true,code:'ready',url:MAP_URL,message:'Karte verbunden.'};
}

function checkWorldMap({timeoutMs=MAP_TIMEOUT_MS,transport=https}={}) {
  return new Promise(resolve=>{
    let finished=false;
    function complete(data){
      if(finished)return;
      finished=true;
      resolve(data);
    }
    const request=transport.get(MAP_URL,{
      headers:{Accept:'text/html', 'User-Agent':'LaFamilia-Launcher-WorldMap'},
      agent:false
    },response=>{
      if(response.statusCode!==200){
        response.resume();
        complete(inspectMapResponse(response.statusCode,response.headers['content-type'],''));
        return;
      }
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>MAX_PREVIEW_BYTES) {
          complete({ready:false,code:'too_large',message:'Kartenserver liefert eine unerwartet große Startseite.'});
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.once('error',()=>complete({ready:false,code:'connection',message:'Kartenserver antwortet nicht.'}));
      response.once('end',()=>{
        complete(inspectMapResponse(response.statusCode,response.headers['content-type'],
          Buffer.concat(chunks).toString('utf8')));
      });
    });
    request.setTimeout(Math.min(Math.max(timeoutMs,500),12000),()=>{
      request.destroy();
      complete({ready:false,code:'timeout',message:'Weltkarte antwortet nicht rechtzeitig.'});
    });
    request.once('error',()=>complete({ready:false,code:'connection',
      message:'Die HTTPS-Verbindung zum Kartenserver ist nicht erreichbar.'}));
  });
}

module.exports={MAP_URL,checkWorldMap,inspectMapResponse};
