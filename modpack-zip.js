'use strict';
/* ZIPs werden ausschließlich in einen isolierten Staging-Ordner entpackt.
   Nie direkt in .minecraft entpacken. Jede einzelne Datei wird verifiziert. */
const fs=require('node:fs/promises');
const path=require('node:path');
const {createWriteStream}=require('node:fs');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const crypto=require('node:crypto');
const yauzl=require('yauzl');
const {safeRelative}=require('./modpack-core');
function extractVerifiedZip(zipPath,category,manifestFiles,outputDir,{onFile}={}){
  if(!['resourcepacks','config'].includes(category))throw Error('ZIP-Kategorie nicht erlaubt.');
  const wanted=new Map(manifestFiles.map(item=>[item.path.slice(category.length+1),item]));
  if(wanted.size!==manifestFiles.length)throw Error('Doppelte Dateien im ZIP-Manifest.');
  return new Promise((resolve,reject)=>{
    let done=false,seen=new Set(),zip;
    const fail=error=>{
      if(done)return;
      done=true;
      try{zip?.close();}catch{}
      reject(error);
    };
    yauzl.open(zipPath,{lazyEntries:true,autoClose:true,validateEntrySizes:true,strictFileNames:true},(error,opened)=>{
      if(error){fail(error);return;}
      zip=opened;
      if(zip.entryCount>manifestFiles.length+2000){fail(Error('Zu viele ZIP-Einträge.'));return;}
      zip.on('error',fail);
      zip.on('end',()=>{
        if(done)return;
        if(seen.size!==wanted.size){fail(Error('ZIP enthält nicht alle Manifest-Dateien ('+category+').'));return;}
        done=true;resolve();
      });
      zip.on('entry',entry=>{
        const raw=entry.fileName;
        (async()=>{
          if(raw.includes('\\')||raw.startsWith('/')||raw.includes('\u0000'))throw Error('Unsicherer Dateiname im ZIP.');
          const isDir=raw.endsWith('/');
          const name=isDir?raw.slice(0,-1):raw;
          safeRelative(category+'/'+name,category);
          const mode=(entry.externalFileAttributes>>>16)&0xffff;
          if((mode&0o170000)===0o120000)throw Error('ZIP-Symlink blockiert.');
          if(isDir){zip.readEntry();return;}
          const key=name.toLocaleLowerCase('en-US');
          if(seen.has(key))throw Error('Doppelter Dateiname im ZIP.');
          const original=wanted.get(name);
          if(!original||entry.uncompressedSize!==original.size)throw Error('ZIP-Datei nicht im Manifest oder falsche Größe: '+raw);
          seen.add(key);
          const target=path.join(outputDir,...name.split('/'));
          await fs.mkdir(path.dirname(target),{recursive:true});
          await new Promise((resolveStream,rejectStream)=>{
            zip.openReadStream(entry,(streamError,readStream)=>{
              if(streamError){rejectStream(streamError);return;}
              const hash=crypto.createHash('sha256');
              let length=0;
              const check=new Transform({
                transform(chunk,_enc,cb){
                  length+=chunk.length;
                  if(length>original.size){cb(Error('ZIP-Datei größer als angegeben.'));return;}
                  hash.update(chunk);cb(null,chunk);
                }
              });
              pipeline(readStream,check,createWriteStream(target,{flags:'w'})).then(()=>{
                if(length!==original.size||hash.digest('hex')!==original.sha256)rejectStream(Error('ZIP-SHA-256 stimmt nicht: '+raw));
                else resolveStream();
              },rejectStream);
            });
          });
          onFile?.(category+'/'+name);
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  });
}
module.exports={extractVerifiedZip};
