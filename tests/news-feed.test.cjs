'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeFeed,createNewsController}=require('../news-feed');
const {applyAction}=require('../scripts/manage-news.cjs');
const example={schema:1,news:[{id:'first',date:'2026-11-11',title:'Hallo',body:'Ein Text',image:''}]};
test('News sicher validieren, sortieren und unsichtbare Meldungen filtern',()=>{
  const rows=normalizeFeed({schema:1,news:[
    {...example.news[0],id:'older',date:'2026-11-01'},
    {...example.news[0],id:'newer',date:'2026-11-12'},
    {...example.news[0],id:'hidden',visible:false}
  ]});
  assert.deepEqual(rows.map(x=>x.id),['newer','older']);
  assert.throws(()=>normalizeFeed({schema:1,news:[{...example.news[0],image:'https://evil.example/image.png'}]}));
  assert.throws(()=>normalizeFeed({schema:1,news:[example.news[0],example.news[0]]}));
  assert.throws(()=>normalizeFeed({schema:1,news:[{...example.news[0],date:'2026-02-31'}]}));
});
test('News hinzufügen, bearbeiten und löschen',()=>{
  const added=applyAction(example,{action:'hinzufuegen',title:'Neue Nachricht',body:'Ein neuer Beitrag'});
  assert.equal(added.news.length,2);
  const id=added.news[0].id;
  const modified=applyAction(added,{action:'bearbeiten',id,title:'Bearbeitet',image:'assets/news/test.png'});
  assert.equal(modified.news[0].title,'Bearbeitet');
  assert.equal(modified.news[0].image,'assets/news/test.png');
  const withoutImage=applyAction(modified,{action:'bearbeiten',id,image:'-'});
  assert.equal(withoutImage.news[0].image,'');
  const deleted=applyAction(withoutImage,{action:'loeschen',id});
  assert.equal(deleted.news.length,1);
});
test('Offline-Nachrichten aus Cache zeigen',async()=>{
  let calls=0;
  const fileSystem={
    readFile:async()=>JSON.stringify({feed:example,updatedAt:'2026-11-12T05:00:00Z'}),
    mkdir:async()=>{},writeFile:async()=>{},rename:async()=>{}
  };
  const controller=createNewsController({cacheFile:'/tmp/mock-news-cache.json',getWindow:()=>null,fileSystem,fetcher:async()=>{calls++;throw Error('Offline');}});
  const result=await controller.initialize();
  assert.equal(result.phase,'cached');assert.equal(result.articles.length,1);assert.equal(calls,1);
});
test('Online-News landen auch im Cache',async()=>{
  const writes=[];
  const fileSystem={
    readFile:async()=>{throw Object.assign(Error('Nicht vorhanden'),{code:'ENOENT'});},
    mkdir:async()=>{},writeFile:async(_,text)=>{writes.push(text);},rename:async()=>{}
  };
  const controller=createNewsController({cacheFile:'/tmp/mock-news-cache.json',getWindow:()=>null,fileSystem,fetcher:async()=>example});
  const state=await controller.initialize();
  assert.equal(state.phase,'ready');assert.equal(state.articles[0].title,'Hallo');
  assert.equal(writes.length,1);
});
test('Leerer gültiger News-Feed zeigt keine erfundenen Nachrichten',async()=>{
  const controller=createNewsController({cacheFile:'/tmp/mock-news-cache.json',getWindow:()=>null,
    fetcher:async()=>({schema:1,news:[]}),
    fileSystem:{readFile:async()=>{throw Error('No');},mkdir:async()=>{},writeFile:async()=>{},rename:async()=>{}}
  });
  const state=await controller.initialize();
  assert.equal(state.phase,'ready');assert.equal(state.articles.length,0);
});
