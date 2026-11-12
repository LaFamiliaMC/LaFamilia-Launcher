'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obtainInstaller,executeFabricInstaller}=require('../fabric-auto-install');
const {FABRIC_VERSION_ID,installedFabricVersions}=require('../minecraft-launch');

(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lafamilia-fabric-smoke-'));
  try{
    const gameDir=path.join(dir,'Minecraft Test');
    await fs.mkdir(gameDir,{recursive:true});
    const installer=await obtainInstaller(dir,{update:msg=>console.log(msg)});
    console.log('Offizielle Fabric-JAR mit SHA-256 verifiziert:',installer);
    // Die native Windows-EXE öffnet trotz CLI-Argumenten die GUI; die JAR unterstützt echte CLI-Aufrufe.
    await executeFabricInstaller(installer,gameDir,{findJava:async()=> 'java'});
    const versions=await installedFabricVersions(gameDir);
    if(!versions.includes(FABRIC_VERSION_ID)){
      throw Error('Fabric-Installation nicht bestätigt: '+FABRIC_VERSION_ID);
    }
    console.log('Fabric-Installer erfolgreich ohne GUI:',FABRIC_VERSION_ID);
  }finally{
    await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:500});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
