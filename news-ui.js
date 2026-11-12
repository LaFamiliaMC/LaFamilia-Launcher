'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const api=window.laFamilia,card=document.getElementById('news-container'),host=document.getElementById('news-page-content');
  const status=document.getElementById('news-loading-status');
  if(!card||!host)return;
  const create=(name,cls,text)=>{
    const el=document.createElement(name);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  const panel=create('section','detail-panel lf-news-panel');
  const toolbar=create('div','lf-news-toolbar');
  const intro=create('p','lf-news-intro','Nachrichten, Events und Ankündigungen von La Familia.');
  const refresh=create('button','feature-button','Neuigkeiten aktualisieren');
  refresh.type='button';
  toolbar.append(intro,refresh);
  const fullList=create('div','lf-news-full-list');
  fullList.setAttribute('role','feed');fullList.setAttribute('aria-label','Alle Neuigkeiten');
  const detailStatus=create('p','lf-news-feed-status');
  detailStatus.setAttribute('role','status');
  panel.append(toolbar,fullList,detailStatus);host.replaceChildren(panel);
  function formattedDate(value){
    const parts=String(value||'').split('-');
    return parts.length===3?parts[2]+'.'+parts[1]+'.'+parts[0]:'';
  }
  function imageUrl(value){
    return /^assets\/news\/[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp)$/.test(value)
      ? 'https://raw.githubusercontent.com/LaFamiliaMC/LaFamilia-Launcher/main/'+value : null;
  }
  function showNewsPage(){
    document.dispatchEvent(new CustomEvent('lafamilia:navigate',{detail:{page:'news'}}));
  }
  function makeEntry(news,compact){
    const entry=create('article',compact?'news-item lf-news-preview':'lf-news-entry');
    entry.dataset.newsId=news.id;
    if(news.pinned)entry.classList.add('lf-news-pinned');
    const image=imageUrl(news.image);
    if(image){
      const img=create('img','lf-news-image');img.src=image;img.alt='Bild zur Nachricht '+news.title;
      img.loading='lazy';img.referrerPolicy='no-referrer';entry.append(img);
    }
    const body=create('div','lf-news-body');
    const headline=create('h3','',news.title);
    headline.title='Meldungs-ID: '+news.id;
    const date=create('time','lf-news-date',formattedDate(news.date));
    date.dateTime=news.date;
    const text=compact&&news.body.length>115?news.body.slice(0,112)+'…':news.body;
    body.append(headline,date,create('p','lf-news-text',text));
    if(compact){
      const read=create('button','lf-news-more','Mehr lesen');read.type='button';
      read.addEventListener('click',showNewsPage);body.append(read);
    }else{
      body.append(create('small','lf-news-admin-id','Meldungs-ID: '+news.id));
    }
    entry.append(body);return entry;
  }
  function render(state){
    if(!state||typeof state!=='object')return;
    const entries=Array.isArray(state.articles)?state.articles:[];
    const message=String(state.message||'');
    if(status)status.textContent=state.phase==='error'?message:state.phase==='cached'?'Gespeicherte Meldungen':'';
    detailStatus.textContent=message;
    card.replaceChildren(...entries.slice(0,3).map(x=>makeEntry(x,true)));
    fullList.replaceChildren(...entries.map(x=>makeEntry(x,false)));
    if(!entries.length){
      card.append(create('p','lf-news-empty',state.phase==='loading'?'Lade Neuigkeiten …':'Noch keine Meldungen.'));
      fullList.append(create('p','lf-news-empty',state.phase==='loading'?'Verbinde mit GitHub …':message));
    }
  }
  refresh.addEventListener('click',async()=>{
    if(!api?.refreshNews)return;
    refresh.disabled=true;
    try{render(await api.refreshNews());}
    catch(error){detailStatus.textContent='Fehler: '+error.message;}
    finally{refresh.disabled=false;}
  });
  if(api?.onNewsChange&&api?.getNewsState){
    api.onNewsChange(render);
    api.getNewsState().then(render).catch(()=>{});
  }else render({phase:'error',articles:[],message:'Neuigkeiten nur in der installierten Windows-Version verfügbar.'});
});
