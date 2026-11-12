'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {normalizeUuid,accountFromModern,accountFromLegacy,readActiveAccount,
  trustedTextureUrl,decodeTextures,pngDataUrl,createPlayerProfileController}=require('../player-profile');
const UUID='853c80ef3c3749fdaa49938b674adae6';
const OTHER='f1bfcbddc68b49bfaac9fb9d8ce5293d';
const SKIN='https://textures.minecraft.net/texture/'+'a'.repeat(64);
const CAPE='https://textures.minecraft.net/texture/'+'b'.repeat(64);
function response({skin=SKIN,cape=null,model='classic',id=UUID}={}){
  const textures={};
  if(skin)textures.SKIN={url:skin,metadata:model==='slim'?{model:'slim'}:{}};
  if(cape)textures.CAPE={url:cape};
  return Buffer.from(JSON.stringify({id,name:'jeb_',properties:[{name:'textures',value:Buffer.from(JSON.stringify({
    profileId:id,profileName:'jeb_',textures
  })).toString('base64')}]}));
}
function png(){
  const bytes=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(64,16);bytes.writeUInt32BE(64,20);
  return bytes;
}
test('Aktiven Minecraft-Account erkennen, niemals beliebigen anderen auswählen oder Tokens ausgeben',()=>{
  const accounts={
    activeAccountLocalId:'second',accounts:{
      first:{minecraftProfile:{id:OTHER,name:'FremderSpieler'},accessToken:'TOP_SECRET_1'},
      second:{minecraftProfile:{id:UUID,name:'Jeb_'},accessToken:'TOP_SECRET_2'}
    }
  };
  const identity=accountFromModern(accounts);
  assert.deepEqual(identity,{uuid:UUID,name:'Jeb_'});
  assert.doesNotMatch(JSON.stringify(identity),/TOP_SECRET/);
  assert.equal(accountFromModern({...accounts,activeAccountLocalId:'missing'}),null);
});
test('Alte offizielle Profilstruktur erkennt nur ausgewählten Spieler',()=>{
  const data={selectedUser:{account:'msa-active',profile:UUID},
    authenticationDatabase:{'msa-active':{accessToken:'SECRET',profiles:{[UUID]:'jeb_'}}}};
  assert.deepEqual(accountFromLegacy(data),{uuid:UUID,name:'jeb_'});
  assert.equal(accountFromLegacy({...data,selectedUser:{account:'unknown',profile:UUID}}),null);
});
test('Kontodateien werden nur gelesen; aktive Minecraft-Store-Datei wird erkannt',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-profile-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'.minecraft');
  await fs.mkdir(root);
  const file=path.join(root,'launcher_accounts.json');
  const original=JSON.stringify({activeAccountLocalId:'id1',accounts:{id1:{
    minecraftProfile:{id:UUID,name:'jeb_'},accessToken:'PRIVATE_ACCESS_TOKEN'}}});
  await fs.writeFile(file,original);
  const found=await readActiveAccount({minecraftRoot:root,localAppData:null});
  assert.deepEqual(found,{uuid:UUID,name:'jeb_'});
  assert.equal(await fs.readFile(file,'utf8'),original);
});
test('UUID, Benutzername und Mojang-Textur-URLs werden strikt validiert',()=>{
  assert.equal(normalizeUuid('853c80ef-3c37-49fd-aa49-938b674adae6'),UUID);
  assert.equal(normalizeUuid('../../mine'),null);
  assert.equal(accountFromModern({accounts:{a:{minecraftProfile:{id:UUID,name:'bad name'}}},activeAccountLocalId:'a'}),null);
  assert.equal(trustedTextureUrl('http://textures.minecraft.net/texture/'+'a'.repeat(64)),SKIN);
  for(const url of ['https://evil.example/texture/'+'a'.repeat(64),
    'https://textures.minecraft.net.evil.example/texture/'+'a'.repeat(64),
    'https://textures.minecraft.net/texture/a?token=abc','file:///etc/passwd']){
    assert.equal(trustedTextureUrl(url),null);
  }
});
test('Mojang-Skin und echtes Cape werden nur der passenden UUID zugeordnet',()=>{
  const decoded=decodeTextures(response({cape:CAPE,model:'slim'}).toString(),UUID);
  assert.equal(decoded.skin,SKIN);
  assert.equal(decoded.cape,CAPE);
  assert.equal(decoded.model,'slim');
  assert.equal(decodeTextures(response().toString(),UUID).cape,null);
  assert.throws(()=>decodeTextures(response({id:OTHER}).toString(),UUID),/UUID/);
});
test('Nur PNG mit gültigen Dimensionen wird an den 3D-Viewer übergeben',()=>{
  assert.match(pngDataUrl(png()),/^data:image\/png;base64,/);
  assert.throws(()=>pngDataUrl(Buffer.from('bad image')),/PNG/);
});
test('Öffentliches Spielerprofil: echter Skin und Cape, keine erfundenen Statistiken',async()=>{
  const queried=[];
  const controller=createPlayerProfileController({
    readActive:async()=>({uuid:UUID,name:'jeb_'}),
    fetchBytes:async url=>{queried.push(url);return url.includes('sessionserver')?response({cape:CAPE,model:'slim'}):png();}
  });
  const result=await controller.get();
  assert.equal(result.ok,true);
  assert.equal(result.name,'jeb_');
  assert.equal(result.hasCape,true);
  assert.equal(result.model,'slim');
  assert.deepEqual(result.stats,{playtime:null,kills:null,blocksPlaced:null,blocksMined:null,quests:null});
  assert.equal(queried.length,3);
  const second=await controller.get();
  assert.equal(second.code,'ready');
  assert.equal(queried.length,3,'15-Minuten-Cache verhindert überflüssige Mojang-Abfragen');
});
test('Ohne echten Account kein Name, Skin oder erfundene Minecraft-Anmeldung',async()=>{
  const controller=createPlayerProfileController({
    readActive:async()=>null,
    fetchBytes:async()=>{throw Error('Darf ohne Konto nicht aufgerufen werden');}
  });
  const result=await controller.get();
  assert.equal(result.ok,false);
  assert.equal(result.code,'no_account');
  assert.equal(result.name,undefined);
});
test('Mojang offline: nur Cache für aktuell gewählte UUID verwenden',async()=>{
  let offline=false;
  const controller=createPlayerProfileController({
    readActive:async()=>({uuid:UUID,name:'jeb_'}),
    fetchBytes:async url=>{if(offline)throw Error('offline');return url.includes('sessionserver')?response():png();}
  });
  assert.equal((await controller.get()).ok,true);
  offline=true;
  const stale=await controller.refresh();
  assert.equal(stale.code,'cached');
  assert.equal(stale.uuid,UUID);
});

test('Neuere Kontodatei: alternatives Feld für ausdrücklich aktives Minecraft-Konto',()=>{
  const selected={activeAccountId:'chosen',accounts:{
    ignored:{minecraftProfile:{id:OTHER,name:'FremderSpieler'}},
    chosen:{profile:{uuid:UUID,username:'jeb_'}}
  }};
  assert.deepEqual(accountFromModern(selected),{uuid:UUID,name:'jeb_'});
  assert.equal(accountFromModern({...selected,activeAccountId:'unknown'}),null);
});
test('Öffentliche Spielernamenssuche überprüft echte Mojang-UUID und Namen',async()=>{
  const {lookupPublicPlayer}=require('../player-profile');
  const identity=await lookupPublicPlayer('jeb_',{fetchBytes:async()=>Buffer.from(JSON.stringify({id:UUID,name:'Jeb_'}))});
  assert.deepEqual(identity,{uuid:UUID,name:'Jeb_'});
  await assert.rejects(()=>lookupPublicPlayer('jeb_',{fetchBytes:async()=>Buffer.from(JSON.stringify({id:UUID,name:'Notch'}))}),/nicht gefunden/);
  await assert.rejects(()=>lookupPublicPlayer('../etc',{fetchBytes:async()=>{throw Error('Keine HTTP-Anfrage erlaubt');}}),/gültigen/);
});
test('Manuell eingegebener echter Spieler wird auch nach dem Launcher-Neustart wieder geladen',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-manual-account-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const choiceFile=path.join(base,'profile-choice.json');
  const options={
    choiceFile,readActive:async()=>null,
    lookup:async requested=>{
      assert.equal(requested,'jeb_');
      return {uuid:UUID,name:'jeb_'};
    },
    fetchBytes:async url=>url.includes('sessionserver')?response({cape:CAPE}):png()
  };
  const first=createPlayerProfileController(options);
  const fromName=await first.chooseName('jeb_');
  assert.equal(fromName.ok,true);
  assert.equal(fromName.source,'manual');
  assert.equal(fromName.hasCape,true);
  const raw=await fs.readFile(choiceFile,'utf8');
  assert.deepEqual(JSON.parse(raw),{uuid:UUID,name:'jeb_'});
  assert.doesNotMatch(raw,/token|accessToken|password/i);
  const second=createPlayerProfileController(options);
  const cached=await second.get();
  assert.equal(cached.ok,true);
  assert.equal(cached.source,'saved');
  assert.equal(cached.name,'jeb_');
});
test('Automatisch erkanntes aktives Konto ist vorrangig vor einem gespeicherten Anzeigeprofil',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-active-account-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const choiceFile=path.join(base,'profile-choice.json');
  await fs.writeFile(choiceFile,JSON.stringify({uuid:OTHER,name:'Notch'}));
  let active=true;
  const ctrl=createPlayerProfileController({
    choiceFile,readActive:async()=>active?{uuid:UUID,name:'jeb_'}:null,
    fetchBytes:async url=>url.includes('sessionserver')?response():png()
  });
  const result=await ctrl.get();
  assert.equal(result.source,'launcher');
  assert.equal(result.uuid,UUID);
});
test('Ungültiger manueller Name wird abgewiesen bevor eine HTTP-Anfrage erfolgt',async()=>{
  let called=false;
  const ctrl=createPlayerProfileController({
    readActive:async()=>null,lookup:async()=>{called=true;throw Error('Darf nicht aufgerufen werden');}
  });
  const result=await ctrl.chooseName('../../secret');
  assert.equal(result.code,'invalid_name');
  assert.equal(called,false);
});
