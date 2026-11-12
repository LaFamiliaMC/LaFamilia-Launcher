'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {validateMetricsUrl,queryServerMetrics}=require('../server-metrics');
test('HTTP-Metrik-Adresse validieren',()=>{
  assert.equal(validateMetricsUrl('http://127.0.0.1:25566/status'),'http://127.0.0.1:25566/status');
  for(const url of ['file:///etc/passwd','javascript:alert(1)','http://u:p@host/status','not a url'])assert.throws(()=>validateMetricsUrl(url));
});
test('Echte TPS und Laufzeit vom HTTP-Endpunkt lesen',async()=>{
  const srv=http.createServer((req,res)=>res.end(JSON.stringify({tps:19.95,uptimeSeconds:92823})));
  await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  try{const result=await queryServerMetrics('http://127.0.0.1:'+srv.address().port+'/status');
    assert.equal(result.tps,19.95);assert.equal(result.uptimeSeconds,92823);
  }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('Ungültige TPS dürfen nicht angezeigt werden',async()=>{
  const srv=http.createServer((req,res)=>res.end(JSON.stringify({tps:'n/a',uptimeSeconds:77})));
  await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  try{await assert.rejects(queryServerMetrics('http://127.0.0.1:'+srv.address().port+'/status'));}
  finally{await new Promise(resolve=>srv.close(resolve));}
});
