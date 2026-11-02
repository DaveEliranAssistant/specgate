import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { commitFixture } from './fixture-git.mjs';
import { scanRepository as scanCommittedRepository } from '../src/scan.mjs';
const scanRepository = options => { commitFixture(options.root); return scanCommittedRepository(options); };
const generator=await import('../src/generate.mjs').catch(()=>({}));
const packageRoot=resolve(import.meta.dirname,'..');
function run(config,base){return new Promise((resolveRun,reject)=>{
 const child=spawn(process.execPath,[resolve(packageRoot,'../../node_modules/@playwright/test/cli.js'),'test','--config',config],{env:{...process.env,SPECGATE_BASE_URL:base},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Playwright runtime timed out'));},25000);
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolveRun({code,output});});
});}
test('generated API tests catch a live seeded defect and reject off-host targets and redirects',async t=>{
 assert.equal(typeof generator.generateTests,'function','generateTests must exist');
 const work=mkdtempSync(join(packageRoot,'.runtime-'));t.after(()=>rmSync(work,{recursive:true,force:true}));mkdirSync(join(work,'src'));
 writeFileSync(join(work,'src/app.mjs'),`import express from 'express'; export const app=express(); export function create(req,res){res.status(201).json({ok:true});} app.post('/tickets',create);`);
 const scan=await scanRepository({root:work,sources:['src']});
 const doc={schemaVersion:'specgate.scenarios/1',review:{reference:'requirements/tickets.md'},scenarios:[{id:'create.reviewed',classification:'approved_requirement',steps:[{method:'POST',path:'/tickets',expected:{status:201,bodyMatch:{ok:true}}}]}]};
 const spec=generator.generateTests(doc,scan);writeFileSync(join(work,'api.spec.mjs'),spec);
 const config=join(work,'playwright.config.mjs');writeFileSync(config,`export default {testDir:${JSON.stringify(work)},testMatch:'api.spec.mjs',workers:1,retries:0,timeout:5000,reporter:'line',outputDir:${JSON.stringify(join(work,'output'))}};`);
 let status=201,visits=0,redirectVisits=0;
 const server=createServer((req,res)=>{if(req.url==='/destination')redirectVisits++;visits++;res.writeHead(status,status===302?{location:'/destination'}:{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));t.after(()=>new Promise(resolveClose=>server.close(resolveClose)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const good=await run(config,base);assert.equal(good.code,0,good.output);assert.match(good.output,/1 passed/);
 status=200;const defect=await run(config,base);assert.notEqual(defect.code,0);assert.match(defect.output,/Expected:.*201/);assert.match(defect.output,/Received:.*200/);
 assert.equal(generator.generateTests(doc,scan),spec,'seeded defect must not alter expected results');
 const previous=visits;const offhost=await run(config,'https://example.com');assert.notEqual(offhost.code,0);assert.equal(visits,previous);assert.match(offhost.output,/explicit isolated/);
 status=302;const redirect=await run(config,base);assert.notEqual(redirect.code,0);assert.equal(redirectVisits,0);
});
