'use strict';
const net=require('node:net');
const {performance}=require('node:perf_hooks');
const MAX_RESPONSE=1024*1024;
function parseAddress(input){
  if(typeof input!=='string')throw Error('Bitte eine Serveradresse eingeben.');
  const raw=input.trim();
  if(!raw||raw.length>300||/[\s/@\\?#]/.test(raw))throw Error('Ungültige Serveradresse.');
  let host,portText;
  if(raw.startsWith('[')){
    const match=raw.match(/^\[([a-fA-F0-9:.]+)\](?::([0-9]{1,5}))?$/);
    if(!match||net.isIP(match[1])!==6)throw Error('Ungültige IPv6-Adresse.');
    host=match[1];portText=match[2];
  }else{
    const parts=raw.split(':');
    if(parts.length>2)throw Error('IPv6-Adressen bitte in eckige Klammern setzen.');
    host=parts[0];portText=parts[1];
    if(!host||host.length>253||!/^[A-Za-z0-9.-]+$/.test(host)||host.split('.').some(x=>!x||x.length>63||x.startsWith('-')||x.endsWith('-')))throw Error('Ungültiger Hostname.');
  }
  const port=portText===undefined?25565:Number(portText);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Port muss zwischen 1 und 65535 liegen.');
  return {host,port,address:(net.isIP(host)===6?'['+host+']':host)+':'+port};
}
function encodeVarInt(input){
  const bytes=[];let n=input>>>0;
  do{let b=n&127;n>>>=7;if(n)b|=128;bytes.push(b);}while(n);
  return Buffer.from(bytes);
}
function readVarInt(buffer,offset=0){
  let value=0;
  for(let i=0;i<5;i++){
    if(offset+i>=buffer.length)return null;
    const byte=buffer[offset+i];
    value|=(byte&127)<<(7*i);
    if(!(byte&128))return {value:value>>>0,bytes:i+1};
  }
  throw Error('Ungültiges Minecraft-Paket.');
}
function frame(content){return Buffer.concat([encodeVarInt(content.length),content]);}
function parseStatusPacket(buffer){
  const outer=readVarInt(buffer);
  if(!outer)return null;
  if(outer.value>MAX_RESPONSE)throw Error('Serverantwort zu groß.');
  if(buffer.length<outer.bytes+outer.value)return null;
  const content=buffer.subarray(outer.bytes,outer.bytes+outer.value);
  const packet=readVarInt(content);
  if(!packet||packet.value!==0)throw Error('Keine Minecraft-Statusantwort.');
  const size=readVarInt(content,packet.bytes);
  if(!size||size.value>MAX_RESPONSE||packet.bytes+size.bytes+size.value>content.length)throw Error('Unvollständige Statusantwort.');
  const obj=JSON.parse(content.subarray(packet.bytes+size.bytes,packet.bytes+size.bytes+size.value).toString('utf8'));
  if(!obj||!obj.version||!obj.players)throw Error('Minecraft-Statusinformationen fehlen.');
  return {
    version:String(obj.version.name||'Unbekannt').slice(0,80),
    playersOnline:Number.isInteger(obj.players.online)&&obj.players.online>=0?obj.players.online:null,
    playersMax:Number.isInteger(obj.players.max)&&obj.players.max>=0?obj.players.max:null
  };
}
function queryJavaStatus(address,opts={}){
  const {host,port}=parseAddress(address);
  const timeoutMs=Math.max(250,Math.min(12000,Number(opts.timeoutMs)||5000));
  const name=Buffer.from(host,'utf8');
  const handshake=Buffer.concat([encodeVarInt(0),encodeVarInt(767),encodeVarInt(name.length),name,Buffer.from([(port>>8)&255,port&255]),encodeVarInt(1)]);
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host,port});
    const started=performance.now();let done=false,received=Buffer.alloc(0);
    const finish=(error,result)=>{if(done)return;done=true;socket.destroy();if(error)reject(error);else resolve(result);};
    socket.setTimeout(timeoutMs);
    socket.on('timeout',()=>finish(Error('Zeitüberschreitung – Server oder Port antwortet nicht.')));
    socket.on('error',error=>finish(Error('Server nicht erreichbar: '+(error.code||error.message))));
    socket.on('close',()=>{if(!done)finish(Error('Server hat die Verbindung beendet.'));});
    socket.on('connect',()=>socket.write(Buffer.concat([frame(handshake),frame(encodeVarInt(0))])));
    socket.on('data',chunk=>{
      if(done)return;
      received=Buffer.concat([received,chunk]);
      if(received.length>MAX_RESPONSE+8)return finish(Error('Serverantwort zu groß.'));
      try{
        const result=parseStatusPacket(received);
        if(result)finish(null,{phase:'online',online:true,...result,pingMs:Math.max(0,Math.round(performance.now()-started))});
      }catch(error){finish(error);}
    });
  });
}
module.exports={parseAddress,queryJavaStatus,encodeVarInt,parseStatusPacket};
