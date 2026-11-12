'use strict';
const http=require('node:http'),https=require('node:https');
function validateMetricsUrl(value){
  if(typeof value!=='string'||value.trim().length>500)throw Error('Ungültige Metrik-Adresse.');
  let url;try{url=new URL(value.trim());}catch{throw Error('Vollständige HTTP-/HTTPS-Adresse eingeben.');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.hash)throw Error('Metrik-Adresse muss HTTP(S) ohne Zugangsdaten sein.');
  return url.toString();
}
function queryServerMetrics(value,{timeoutMs=3000}={}){
  const url=validateMetricsUrl(value);
  return new Promise((resolve,reject)=>{
    let done=false;const finish=(e,result)=>{if(done)return;done=true;if(e)reject(e);else resolve(result);};
    const req=(url.startsWith('https:')?https:http).get(url,{headers:{Accept:'application/json'}},res=>{
      if(res.statusCode!==200){res.resume();return finish(Error('Metrik-Server: HTTP '+res.statusCode));}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>16384){req.destroy();return finish(Error('Metrik-Antwort zu groß.'));}chunks.push(chunk);});
      res.on('end',()=>{try{
        const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!data||typeof data!=='object'||data.tps===undefined||data.tps===null||data.uptimeSeconds===undefined||data.uptimeSeconds===null)throw Error('Metrik-Daten fehlen.');
        const tps=Number(data.tps),uptimeSeconds=Number(data.uptimeSeconds);
        if(!Number.isFinite(tps)||tps<0||tps>20.5||!Number.isFinite(uptimeSeconds)||uptimeSeconds<0||uptimeSeconds>315360000)throw Error('Ungültige Metrik-Daten.');
        finish(null,{tps:Math.min(20,tps),uptimeSeconds:Math.floor(uptimeSeconds)});
      }catch(e){finish(e);}});
      res.on('error',finish);
    });
    req.setTimeout(Math.max(200,Math.min(10000,timeoutMs)),()=>req.destroy(Error('Metrik-Zeitüberschreitung.')));
    req.on('error',finish);
  });
}
module.exports={validateMetricsUrl,queryServerMetrics};
