'use strict';
const fs=require('node:fs');
const path=require('node:path');
function versionForRun(run){
  const value=String(run??'');
  if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Ungültige GitHub-Run-Nummer.');
  return '1.4.'+Number(value);
}
function setVersion(file,run){
  const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
  const before=pkg.version;
  pkg.version=versionForRun(run);
  fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n','utf8');
  return {before,after:pkg.version};
}
if(require.main===module){
  if(process.env.GITHUB_ACTIONS!=='true')throw Error('Nur für GitHub Actions.');
  console.log(setVersion(path.resolve(__dirname,'../package.json'),process.env.GITHUB_RUN_NUMBER));
}
module.exports={versionForRun,setVersion};
