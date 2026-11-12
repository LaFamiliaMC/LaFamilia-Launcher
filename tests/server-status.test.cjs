'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {parseAddress,queryJavaStatus,encodeVarInt}=require('../server-status');
test('Serveradresse mit optionalem Port prüfen',()=>{
  assert.equal(parseAddress('23.88.65.87').address,'23.88.65.87:25565');
  assert.equal(parseAddress('localhost:25566').port,25566);
  assert.equal(parseAddress('[::1]:25567').host,'::1');
  for(const address of ['','https://example.org','a:0','a:65536','a:abc','a/b','foo bar','[::1'])assert.throws(()=>parseAddress(address));
});
test('Minecraft Java Statuspaket über TCP abfragen',async()=>{
  const server=net.createServer(socket=>socket.once('data',()=>{
    const json=Buffer.from(JSON.stringify({version:{name:'Fabric 1.21.1'},players:{online:4,max:25}}));
    const packet=Buffer.concat([Buffer.from([0]),encodeVarInt(json.length),json]);
    socket.end(Buffer.concat([encodeVarInt(packet.length),packet]));
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const status=await queryJavaStatus('127.0.0.1:'+server.address().port,{timeoutMs:3000});
    assert.equal(status.online,true);assert.equal(status.playersOnline,4);
    assert.equal(status.playersMax,25);assert.equal(status.version,'Fabric 1.21.1');
    assert.ok(Number.isFinite(status.pingMs));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('Kaputte TCP-Verbindung gibt keinen erfundenen Serverstatus',async()=>{
  const server=net.createServer(socket=>socket.destroy());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await assert.rejects(queryJavaStatus('127.0.0.1:'+server.address().port,{timeoutMs:1000}));}
  finally{await new Promise(resolve=>server.close(resolve));}
});
