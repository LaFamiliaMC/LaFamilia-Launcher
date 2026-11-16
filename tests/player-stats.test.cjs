'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {
  normalizePlayerUuid,validatePlayerStatsUrl,playerStatsEndpoint,
  validateStatsResponse,requestStats,createPlayerStatsController
}=require('../player-stats');
const uuid='853c80ef-3c37-49fd-aa49-938b674adae6';
const other='f1bfcbdd-c68b-49bf-aac9-fb9d8ce5293d';
const token='T'.repeat(43);
const stats={schema:1,uuid,online:true,playTimeTicks:102400,deaths:4,mobKills:18,
  playerKills:2,blocksMined:800,mcLevel:13,blocksPlaced:null,rank:null,quests:null};
async function withFile(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-playerstats-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return path.join(dir,'private-player-link.json');
}
test('Akzeptiert nur HTTPS-Server oder lokalen HTTP-Host',()=>{
  assert.equal(validatePlayerStatsUrl('https://server.example/status'),'https://server.example/status');
  assert.equal(validatePlayerStatsUrl('http://localhost:25566/status'),'http://localhost:25566/status');
  assert.equal(validatePlayerStatsUrl('https://server.example/'),'https://server.example/status');
  assert.throws(()=>validatePlayerStatsUrl('http://23.88.65.87:25566/status'),/HTTPS/);
  for(const u of ['file:///etc/passwd','https://user:secret@example.com/status','https://a.example/status?token=secret','https://a.example/other']){
    assert.throws(()=>validatePlayerStatsUrl(u));
  }
  assert.equal(playerStatsEndpoint('https://server.example/status',uuid),
    'https://server.example/player/'+uuid);
  assert.equal(normalizePlayerUuid(uuid.replaceAll('-','')),uuid);
});
test('Serverstatistiken sind streng UUID-gebunden und nur echte Zahlen erlaubt',()=>{
  assert.deepEqual(validateStatsResponse(stats,uuid),{
    uuid,online:true,playTimeTicks:102400,deaths:4,mobKills:18,
    playerKills:2,blocksMined:800,mcLevel:13,blocksPlaced:null,rank:null,quests:null
  });
  assert.throws(()=>validateStatsResponse(stats,other),/passen nicht/);
  assert.throws(()=>validateStatsResponse({...stats,mobKills:-1},uuid),/Ungültige/);
  assert.throws(()=>validateStatsResponse({...stats,mcLevel:'20'},uuid),/Ungültige/);
  const safe=validateStatsResponse({...stats,blocksPlaced:999,rank:'Admiral',quests:100},uuid);
  assert.equal(safe.blocksPlaced,null);
  assert.equal(safe.rank,null);
  assert.equal(safe.quests,null);
});
test('Persönlicher Pairing-Schlüssel bleibt privat im Hauptprozess',async t=>{
  const file=await withFile(t);
  const ctrl=createPlayerStatsController({file,fetchStats:async()=>stats});
  assert.deepEqual(await ctrl.info(),{url:'',linkedUuid:null,hasToken:false});
  const publicView=await ctrl.connect({url:'https://server.example/status',token,uuid});
  assert.deepEqual(publicView,{url:'https://server.example/status',linkedUuid:uuid,hasToken:true});
  assert.doesNotMatch(JSON.stringify(publicView),new RegExp(token));
  assert.match(await fs.readFile(file,'utf8'),new RegExp(token));
  const otherCtrl=createPlayerStatsController({file,fetchStats:async()=>validateStatsResponse(stats,uuid)});
  const current=await otherCtrl.getStats(uuid);
  assert.equal(current.ok,true);
  assert.equal(current.stats.blocksMined,800);
  assert.equal((await otherCtrl.getStats(other)).code,'different_player');
  await ctrl.disconnect();
  assert.equal((await otherCtrl.getStats(uuid)).code,'unlinked');
});
test('Keine Statistikabfrage ohne Verknüpfung, keine erfundenen Werte',async t=>{
  const file=await withFile(t);
  const ctrl=createPlayerStatsController({file,fetchStats:async()=>{throw Error('Darf nicht aufgerufen werden');}});
  const result=await ctrl.getStats(uuid);
  assert.equal(result.code,'unlinked');
  assert.equal(result.stats,undefined);
  await assert.rejects(()=>ctrl.connect({url:'https://server.example/status',token:'short',uuid}),/Schlüssel/);
});
test('Live-HTTP-Abfrage benutzt Bearer-Header und liefert keine fremden UUID-Werte',async t=>{
  const seen=[];
  const server=http.createServer((req,res)=>{
    seen.push({url:req.url,auth:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end('{}');return;}
    res.end(JSON.stringify(stats));
  });
  server.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port+'/status';
  const result=await requestStats(base,token,uuid);
  assert.equal(result.playTimeTicks,102400);
  assert.equal(seen[0].url,'/player/'+uuid);
  assert.equal(seen[0].auth,'Bearer '+token);
  await assert.rejects(()=>requestStats(base,token,other),/passen nicht/);
});
test('HTTP 401 wird verständlich gemeldet statt Schlüssel auszugeben',async t=>{
  const server=http.createServer((_req,res)=>{res.writeHead(401);res.end('unauthorized');});
  server.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port+'/status';
  await assert.rejects(()=>requestStats(base,token,uuid),error=>{
    assert.match(error.message,/widerrufen/);
    assert.ok(!error.message.includes(token));
    return true;
  });
});
