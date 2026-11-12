'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {normalizeManifest,canonicalizeManifestDownloadUrls}=require('../modpack-core');
const {extractVerifiedZip}=require('../modpack-zip');
(async()=>{
  const m=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  const rel=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
  const folder=process.argv[4];
  const data=normalizeManifest(canonicalizeManifestDownloadUrls(m,rel));
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-real-zip-'));
  try{
    for(const category of ['config','resourcepacks']){
      let count=0;
      const archive=path.join(folder,category+'.zip');
      await extractVerifiedZip(archive,category,data[category].files,path.join(tmp,category),{onFile:()=>{count++;}});
      if(count!==data[category].files.length)throw Error('Abweichende Datei-Anzahl: '+category);
      console.log('ZIP geprüft:',category,count,'Dateien');
    }
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
