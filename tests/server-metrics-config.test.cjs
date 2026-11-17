'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {LA_FAMILIA_SERVER,LA_FAMILIA_METRICS,resolveMetricsUrl}=require('../server-metrics-config');

test('La Familia TPS und Laufzeit verwenden fest die funktionierende HTTPS-Adresse',()=>{
  assert.equal(LA_FAMILIA_SERVER,'23.88.65.87:25565');
  assert.equal(LA_FAMILIA_METRICS,'https://23.88.65.87/status');
  const packaged=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/server.json'),'utf8'));
  assert.equal(packaged.address,LA_FAMILIA_SERVER);
  assert.equal(packaged.metricsUrl,LA_FAMILIA_METRICS);
});

test('Automatischer HTTPS-Abruf ohne manuelle Eingabe oder lokale Einstellung',()=>{
  assert.equal(resolveMetricsUrl(LA_FAMILIA_SERVER,null),LA_FAMILIA_METRICS);
  assert.equal(resolveMetricsUrl(LA_FAMILIA_SERVER,''),LA_FAMILIA_METRICS);
  assert.equal(resolveMetricsUrl(LA_FAMILIA_SERVER,undefined),LA_FAMILIA_METRICS);
});

test('Alte oder fehlerhafte Metrik-Konfiguration überschreibt nicht den La Familia Server',()=>{
  for(const saved of [
    'http://23.88.65.87:25566/status',
    'https://23.88.65.87:25566/status',
    'not a url',
    'http://anderer-server.example/status'
  ])assert.equal(resolveMetricsUrl(LA_FAMILIA_SERVER,saved),LA_FAMILIA_METRICS);
});

test('Andere Minecraft-Server erhalten keine fälschlich zugeordneten La Familia Daten',()=>{
  assert.equal(resolveMetricsUrl('anderer-server.example:25565',null),'');
  assert.equal(resolveMetricsUrl('anderer-server.example:25565',''),'');
  assert.equal(resolveMetricsUrl('anderer-server.example:25565','https://anderer-server.example/status'),
    'https://anderer-server.example/status');
  assert.equal(resolveMetricsUrl('anderer-server.example:25565','falsche-adresse'),'');
});
