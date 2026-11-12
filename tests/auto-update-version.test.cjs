'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {versionForRun,setVersion}=require('../scripts/set-ci-version.cjs');
test('Jeder GitHub-Run erhält eine eindeutige Version',()=>{
  assert.equal(versionForRun('34'),'1.4.34');
  assert.equal(versionForRun(35),'1.4.35');
});
test('Ungültige Nummern werden abgewiesen',()=>{
  for(const value of [undefined,'','-1','0','1.5','abc','01','9007199254740999'])assert.throws(()=>versionForRun(value));
});
test('Es wird nur die lokale Build-Kopie geändert',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lf-version-test-'));
  try{
    const file=path.join(dir,'package.json');
    fs.writeFileSync(file,JSON.stringify({name:'lafamilia',version:'1.3.9',private:true}));
    assert.deepEqual(setVersion(file,42),{before:'1.3.9',after:'1.4.42'});
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).private,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
