'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {advancementsEndpoint,validateAchievementsResponse,requestAchievements}=require('../player-achievements');
const {createPlayerStatsController}=require('../player-stats');

const uuid='853c80ef-3c37-49fd-aa49-938b674adae6';
const different='f1bfcbdd-c68b-49bf-aac9-fb9d8ce5293d';
const token='T'.repeat(43);
const achievements={
  schema:1,uuid,available:true,online:true,completed:2,source:'live',
  items:[{id:'minecraft:story/mine_stone',title:'Stone Age',obtainedAt:'2026-11-17T06:00:00Z'},
    {id:'minecraft:story/root',title:'Minecraft',obtainedAt:null}]
};

test('Advancement path keeps the original /player/<UUID> private route',()=>{
  assert.equal(advancementsEndpoint('https://23.88.65.87/status',uuid),
    'https://23.88.65.87/player/'+uuid+'/advancements');
  assert.throws(()=>advancementsEndpoint('http://23.88.65.87:25566/status',uuid),/HTTPS/);
  assert.throws(()=>advancementsEndpoint('https://user:pass@example.com/status',uuid));
});

test('Only real, completed, bounded achievements for selected player are accepted',()=>{
  assert.deepEqual(validateAchievementsResponse(achievements,uuid),{
    uuid,available:true,online:true,completed:2,source:'live',items:achievements.items
  });
  assert.throws(()=>validateAchievementsResponse(achievements,different),/passen nicht/);
  assert.throws(()=>validateAchievementsResponse({...achievements,completed:1},uuid),/ungültig/i);
  assert.throws(()=>validateAchievementsResponse({...achievements,items:[achievements.items[0],achievements.items[0]]},uuid),/ungültig/i);
  assert.throws(()=>validateAchievementsResponse({...achievements,items:[
    {...achievements.items[0],id:'javascript:bad<script>'}
  ]},uuid),/ungültig/i);
  assert.deepEqual(validateAchievementsResponse({
    schema:1,uuid,available:false,online:false,completed:0,source:'not_saved',items:[]
  },uuid).items,[]);
});

test('HTTP private achievements route uses bearer header without revealing token to the UI',async t=>{
  const seen=[];
  const srv=http.createServer((req,res)=>{
    seen.push({path:req.url,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);res.end('{}');return;}
    res.end(JSON.stringify(achievements));
  });
  srv.listen(0,'127.0.0.1');await new Promise(r=>srv.once('listening',r));
  t.after(()=>new Promise(r=>srv.close(r)));
  const url='http://127.0.0.1:'+srv.address().port+'/status';
  const result=await requestAchievements(url,token,uuid);
  assert.equal(result.completed,2);
  assert.equal(seen[0].path,'/player/'+uuid+'/advancements');
  assert.equal(seen[0].authorization,'Bearer '+token);
  await assert.rejects(requestAchievements(url,'a'.repeat(43),uuid),/widerrufen/);
  await assert.rejects(requestAchievements(url,token,different),/passen nicht/);
});

test('Controller permits only the linked UUID with the existing /lfstats token',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-achievements-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  const file=path.join(folder,'player-links.json');
  const seen=[];
  const controller=createPlayerStatsController({
    file,
    fetchAchievements:async(url,secret,id)=>{
      seen.push({url,secret,id});
      return validateAchievementsResponse(achievements,id);
    }
  });
  assert.equal((await controller.getAchievements(uuid)).code,'unlinked');
  await controller.connect({uuid,url:'https://23.88.65.87/status',token});
  assert.equal((await controller.getAchievements(different)).code,'different_player');
  const result=await controller.getAchievements(uuid);
  assert.equal(result.ok,true);
  assert.equal(result.achievements.completed,2);
  assert.equal(seen.length,1);
  assert.deepEqual(seen[0],{url:'https://23.88.65.87/status',secret:token,id:uuid});
  assert.doesNotMatch(JSON.stringify(result),new RegExp(token));
  await controller.disconnect();
  assert.equal((await controller.getAchievements(uuid)).code,'unlinked');
});

test('View, main process, and installer all include private achievements',()=>{
  const read=name=>require('node:fs').readFileSync(path.join(__dirname,'..',name),'utf8');
  assert.match(read('player-profile-ui.js'),/id="lf-profile-achievements"/);
  assert.match(read('index.html'),/player-achievements-ui\.js/);
  assert.match(read('electron-builder.config.js'),/'player-achievements\.js'/);
  assert.match(read('main.js'),/player-achievements:get/);
  assert.match(read('preload.js'),/getPlayerAchievements/);
  assert.match(read('server-addon/src/main/java/de/lafamilia/metrics/PlayerStatsApi.java'),/endsWith\("\/advancements"\)/);
  assert.match(read('server-addon/src/main/java/de/lafamilia/metrics/PlayerAchievementsApi.java'),/getAdvancementTracker\(\)/);
});
