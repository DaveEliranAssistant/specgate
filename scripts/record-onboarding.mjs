// Capture actual static CLI output from controlled synthetic Git sources. Never starts a service.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),work=mkdtempSync(join(tmpdir(),'specgate-recording-'));
const source="import express from 'express'; export const app=express(); app.get('/health',(req,res)=>{res.status(200).json({ok:true});});";
const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:work,encoding:'utf8',env:{...process.env,GIT_AUTHOR_DATE:'2026-11-03T00:00:00Z',GIT_COMMITTER_DATE:'2026-11-03T00:00:00Z'}}).trim();
try{
 mkdirSync(join(work,'src'));git('-c','init.templateDir=','init','-q');
 const examples=[];
 function capture(id,text,args){
  writeFileSync(join(work,'src/app.mjs'),text);git('add','src/app.mjs');git('-c','user.name=SpecGate Example','-c','user.email=example@example.invalid','commit','-qm',id);
  const result=spawnSync(process.execPath,[join(root,'packages/specgate/bin/specgate.mjs'),...args,'--root',work,'--source','src'],{encoding:'utf8',timeout:30000});
  if(![0,1].includes(result.status))throw new Error(result.stderr||'CLI recording failed');
  examples.push({id,exitCode:result.status,sourceCommit:git('rev-parse','HEAD'),sourceSha256:createHash('sha256').update(text).digest('hex'),source:text,report:JSON.parse(result.stdout)});
  return result.stdout;
 }
 const first=capture('scan',source,['scan']);const baseline=join(work,'baseline.json');writeFileSync(baseline,first);
 capture('change',source.replace('ok:true','ok:false'),['check','--baseline',baseline]);
 capture('unsupported',source.replace('(req,res)=>','async (req,res)=>'),['scan']);
 const result={schemaVersion:1,toolVersion:JSON.parse(readFileSync(join(root,'packages/specgate/package.json'))).version,scannerRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),kind:'Recorded synthetic static CLI output; not live scanning or consumer compatibility proof',examples};
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{rmSync(work,{recursive:true,force:true});}
