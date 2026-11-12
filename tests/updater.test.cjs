'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdaterController } = require('../updater');

function fixtures(options = {}) {
  const sent = [];
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {
    updater.emit('checking-for-update');
    if (options.error) throw new Error('kein Internet');
    if (options.update) {
      updater.emit('update-available', {version:'1.3.1'});
      updater.emit('download-progress', {percent: 55.2, transferred:552, total:1000, bytesPerSecond:80});
      updater.emit('update-downloaded', {version:'1.3.1'});
    } else updater.emit('update-not-available');
  };
  let installations = 0;
  updater.quitAndInstall = () => {installations++};
  const controller = createUpdaterController({
    app:{getVersion:()=> '1.3.0',isPackaged:options.packaged??true},
    platform:options.platform??'win32',
    resourcesPath:'/fake/resources',
    updaterFactory:()=>updater,
    fileExists:()=>options.hasFeed??true,
    getWindow:()=>({isDestroyed:()=>false, webContents:{isDestroyed:()=>false, send:(...args)=>sent.push(args)}})
  });
  return {controller,updater,sent,getInstallations:()=>installations};
}

test('Ein Entwickler-Start prüft niemals ungewollt GitHub', async()=>{
  const {controller} = fixtures({packaged:false});
  assert.equal(controller.initialize().phase,'disabled');
  assert.equal((await controller.check()).phase,'disabled');
});

test('Ohne app-update.yml wird keine beliebige Release-Quelle verwendet',()=>{
  const {controller}=fixtures({hasFeed:false});
  assert.equal(controller.initialize().phase,'not-configured');
});

test('Kein verfügbares Update ergibt aktuelle Version',async()=>{
  const {controller,sent}=fixtures();
  assert.equal(controller.initialize().phase,'idle');
  const result=await controller.check();
  assert.equal(result.phase,'current');
  assert.ok(sent.some(x=>x[0]==='updates:state'));
});

test('Update heruntergeladen und installierbar',async()=>{
  const {controller,getInstallations}=fixtures({update:true});
  controller.initialize();
  assert.equal((await controller.check()).phase,'downloaded');
  assert.equal(controller.state().percent,100);
  assert.equal(controller.install().ok,true);
  assert.equal(getInstallations(),1);
});

test('Netzwerkfehler beendet nicht die Anwendung',async()=>{
  const {controller}=fixtures({error:true});
  controller.initialize();
  assert.equal((await controller.check()).phase,'error');
  assert.equal(controller.install().ok,false);
});
