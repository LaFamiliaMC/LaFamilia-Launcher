'use strict';
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const os=require('node:os');
const fs=require('node:fs/promises');
const path=require('node:path');
const {obtainInstaller}=require('../fabric-auto-install');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-fabric-smoke-'));
  try{
    const installer=await obtainInstaller(dir,{update:msg=>console.log(msg)});
    console.log('Offizieller Fabric-Installer mit SHA-256 bestätigt:',installer);
    const result=await promisify(execFile)(installer,['help'],{windowsHide:true,timeout:120000,maxBuffer:1024*1024});
    console.log('Fabric-Installer-CLI:',String(result.stdout||result.stderr).slice(0,1000));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
