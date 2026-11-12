'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const file=path.join(__dirname,'..','data','news.json');
function fail(message){throw Error(message);}
function dateValid(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function imageValid(s){return !s||s==='-'||/^assets\/news\/[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp)$/.test(s);}
function applyAction(data,input){
  if(!data||data.schema!==1||!Array.isArray(data.news))fail('Ungültige data/news.json.');
  const news=data.news.map(item=>({...item}));
  const action=String(input.action||'').trim(),id=String(input.id||'').trim();
  const title=String(input.title||'').trim(),body=String(input.body||'').trim();
  const image=String(input.image||'').trim(),date=String(input.date||'').trim();
  if(!['hinzufuegen','bearbeiten','loeschen'].includes(action))fail('Aktion nicht erkannt.');
  if(title.length>140||body.length>5000)fail('Titel maximal 140 Zeichen, Text maximal 5000 Zeichen.');
  if(!imageValid(image))fail('Bildpfad muss assets/news/name.png, .jpg oder .webp sein.');
  if(date&&!dateValid(date))fail('Datum bitte als JJJJ-MM-TT eingeben.');
  if(action==='hinzufuegen'){
    if(!title||!body)fail('Zum Hinzufügen bitte Titel und Text eingeben.');
    const newId=crypto.randomUUID().slice(0,13);
    const today=date||new Date().toISOString().slice(0,10);
    news.unshift({id:newId,title,body,date:today,image:image==='-'?'':image});
    return {schema:1,news};
  }
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))fail('Bitte eine gültige Meldungs-ID eintragen.');
  const at=news.findIndex(item=>item.id===id);
  if(at<0)fail('Meldung mit ID '+id+' wurde nicht gefunden.');
  if(action==='loeschen')news.splice(at,1);
  else{
    if(title)news[at].title=title;
    if(body)news[at].body=body;
    if(date)news[at].date=date;
    if(image==='-')news[at].image='';
    else if(image)news[at].image=image;
  }
  return {schema:1,news};
}
if(require.main===module){
  try{
    const before=JSON.parse(fs.readFileSync(file,'utf8'));
    const result=applyAction(before,{
      action:process.env.NEWS_ACTION,id:process.env.NEWS_ID,title:process.env.NEWS_TITLE,
      body:process.env.NEWS_BODY,date:process.env.NEWS_DATE,image:process.env.NEWS_IMAGE
    });
    fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n','utf8');
    console.log('News-Verwaltung erfolgreich: '+result.news.length+' Meldungen.');
  }catch(error){
    console.error('News-Verwaltung fehlgeschlagen: '+error.message);
    process.exitCode=1;
  }
}
module.exports={applyAction,dateValid,imageValid};
