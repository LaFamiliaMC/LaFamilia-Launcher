'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','style.css'),'utf8');
function cssRule(selector) {
  const start=css.indexOf(selector+' {');
  assert.ok(start>=0,'CSS-Regel fehlt: '+selector);
  const open=css.indexOf('{',start), close=css.indexOf('}',open);
  return css.slice(open+1,close);
}
test('Alle drei Startseiten-Karten teilen dieselbe tiefere Textposition',()=>{
  const rule=cssRule('#mod-card-content, #news-container, #updates-card-content');
  const top=Number(rule.match(/top:\s*([\d.]+)%/)[1]);
  const height=Number(rule.match(/height:\s*([\d.]+)%/)[1]);
  assert.ok(top>=20&&top<=25,'Texte dürfen nicht mit der Holz-Titelleiste kollidieren');
  assert.ok(top+height<=85,'Platz über dem Footer muss erhalten bleiben');
  assert.match(rule,/overflow:\s*hidden/);
});
test('Mods bleiben scrollfähig, Rahmen und Buttons unverändert positioniert',()=>{
  assert.match(cssRule('#mod-list'),/overflow-y:\s*auto/);
  assert.match(cssRule('.card-footer'),/bottom:\s*3\.3%/);
  assert.match(css,/background-image:\s*url\('assets\/template-bg\.png'\)/);
});
