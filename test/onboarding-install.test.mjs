import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
test('customer quickstart installs offline, scans committed source, preserves REVIEW and refuses errors',()=>{
 const script=join(root,'onboarding/quickstart.sh');assert.ok(existsSync(script),'customer quickstart is not implemented');
 const work=mkdtempSync(join(tmpdir(),'specgate-onboarding-install-'));
 try{
  const [packed]=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',work],{cwd:join(root,'packages/specgate'),encoding:'utf8'}));
  const archive=join(work,packed.filename),sha=createHash('sha256').update(readFileSync(archive)).digest('hex');
  const service=join(work,'service');mkdirSync(join(service,'src'),{recursive:true});
  const source="import express from 'express'; export const app=express(); app.get('/health',(req,res)=>{res.status(200).json({ok:true});});";
  writeFileSync(join(service,'src/app.mjs'),source);
  writeFileSync(join(service,'package.json'),JSON.stringify({scripts:{preinstall:'exit 99'},dependencies:{express:'0.0.0-do-not-install'}}));
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd:service,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git('-c','init.templateDir=','init','-q');git('add','src/app.mjs','package.json');git('-c','user.name=SpecGate Fixture','-c','user.email=fixture@example.invalid','commit','-qm','controlled source');
  const run=(name,overrides={})=>spawnSync('bash',[script],{encoding:'utf8',timeout:60000,env:{...process.env,SPECGATE_ARCHIVE:archive,SPECGATE_SHA256:sha,SERVICE_ROOT:service,SOURCE_SCOPE:'src',PILOT_DIR:join(work,name),...overrides}});
  const good=run('good');assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(readFileSync(join(work,'good/scan.json'))).complete,true);assert.match(good.stdout,/not.*compatibility guarantee/i);
  assert.equal(existsSync(join(service,'node_modules')),false);
  const inside=run('inside',{PILOT_DIR:join(service,'private-tool')});assert.equal(inside.status,2,'Private tooling must not be installed into the scanned repository');assert.equal(existsSync(join(service,'private-tool')),false);
  writeFileSync(join(service,'src/app.mjs'),source.replace('app.get','app.post'));
  const uncommitted=run('uncommitted');assert.equal(uncommitted.status,0,uncommitted.stderr);assert.equal(JSON.parse(readFileSync(join(work,'uncommitted/scan.json'))).routes[0].method,'GET');
  writeFileSync(join(service,'src/app.mjs'),source.replace('(req,res)=>','async (req,res)=>'));git('add','src/app.mjs');git('-c','user.name=SpecGate Fixture','-c','user.email=fixture@example.invalid','commit','-qm','unsupported async handler');
  const partial=run('partial');assert.equal(partial.status,1,partial.stderr);assert.equal(JSON.parse(readFileSync(join(work,'partial/scan.json'))).complete,false);assert.match(partial.stdout,/Review required/);
  const bad=run('bad-digest',{SPECGATE_SHA256:'0'.repeat(64)});assert.equal(bad.status,2);assert.equal(existsSync(join(work,'bad-digest')),false);
  const unsafe=run('unsafe',{SOURCE_SCOPE:'../escape'});assert.equal(unsafe.status,2);assert.equal(existsSync(join(work,'unsafe/scan.json')),false);
  const existing=run('good');assert.equal(existing.status,2);assert.match(existing.stderr,/exist/i);
 }finally{rmSync(work,{recursive:true,force:true});}
});
