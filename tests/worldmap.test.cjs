'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {MAP_URL,inspectMapResponse,checkWorldMap}=require('../worldmap');

test('Nur feste verschlüsselte La Familia BlueMap-Adresse, keine frei wählbaren URLs',()=>{
  assert.equal(MAP_URL,'https://23.88.65.87/map/');
  assert.equal(new URL(MAP_URL).protocol,'https:');
  assert.equal(new URL(MAP_URL).pathname,'/map/');
});

test('Unbekannte Serverantworten werden nicht als echte Weltkarte angezeigt',()=>{
  assert.equal(inspectMapResponse(404,'text/html','').ready,false);
  assert.equal(inspectMapResponse(502,'text/html','').code,'unavailable');
  assert.equal(inspectMapResponse(200,'text/html','<html><title>Meine Seite</title></html>').ready,false);
  assert.equal(inspectMapResponse(200,'application/json','BlueMap').ready,false);
  assert.equal(inspectMapResponse(200,'text/html','<title>BlueMap</title>').ready,true);
});

function fakeTransport(statusCode,body,contentType='text/html'){
  let captured;
  return {
    get(url,options,callback){
      captured={url,options};
      const req=new EventEmitter();
      req.setTimeout=()=>{};
      req.destroy=()=>{};
      process.nextTick(()=>{
        const response=new EventEmitter();
        response.statusCode=statusCode;
        response.headers={'content-type':contentType};
        response.resume=()=>{};
        callback(response);
        if(statusCode===200){
          response.emit('data',Buffer.from(body));
          response.emit('end');
        }
      });
      return req;
    },
    get captured(){return captured;}
  };
}

test('Prüfung fragt nur HTTPS /map/ ab und erkennt einen BlueMap-Server',async()=>{
  const transport=fakeTransport(200,'<!doctype html><html><title>BlueMap</title></html>');
  const result=await checkWorldMap({transport});
  assert.equal(result.ready,true);
  assert.equal(result.url,MAP_URL);
  assert.equal(transport.captured.url,MAP_URL);
  assert.equal(transport.captured.options.headers.Accept,'text/html');
});

test('Ohne installierten Kartenserver keine erfundene Weltkarte',async()=>{
  const response=await checkWorldMap({transport:fakeTransport(404,'')});
  assert.equal(response.ready,false);
  assert.equal(response.code,'missing');
  assert.equal(response.url,undefined);
});

test('Weltkarten-Ansicht bleibt im vorhandenen Mittelfenster und ist Bestandteil des Setups',()=>{
  const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  const index=read('index.html');
  const renderer=read('renderer.js');
  const builder=read('electron-builder.config.js');
  const ui=read('worldmap-ui.js');
  assert.match(index,/id="page-worldmap"/);
  assert.match(index,/worldmap-ui\.js/);
  assert.match(index,/frame-src https:\/\/23\.88\.65\.87/);
  assert.doesNotMatch(renderer,/setupInfoPage\('worldmap-page-content'/);
  assert.match(builder,/'worldmap\.js'/);
  assert.match(builder,/'worldmap-ui\.js'/);
  assert.match(ui,/id="lf-map-frame"/);
  assert.match(ui,/Im Browser öffnen/);
  assert.match(ui,/Noch keine Live-Weltkarte/);
});
