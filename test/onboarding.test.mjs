import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=new URL('../',import.meta.url);
function withVercelEnv(value,run){
 const previous=process.env.VERCEL;
 if(value===undefined)delete process.env.VERCEL;else process.env.VERCEL=value;
 try{return run();}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
}
function snapshot(dir){return readdirSync(dir).sort().map(name=>{const file=join(dir,name);return [name,readFileSync(file,'utf8'),statSync(file).mtimeMs];});}
test('fit check distinguishes supported, unsupported and uncommitted source',async()=>{
 assert.ok(existsSync(new URL('onboarding/app.mjs',root)),'onboarding fit check is not implemented');
 const {assessFit}=await import('../onboarding/app.mjs');
 assert.equal(assessFit({framework:'literal',committed:'yes',node:'22',platform:'linux'}).ready,true);
 assert.equal(assessFit({framework:'literal',committed:'yes',node:'24',platform:'macos'}).ready,true);
 for(const changes of [{framework:'router'},{framework:'typescript'},{node:'20'},{platform:'windows'},{committed:'no'},{}]){
  const input=Object.keys(changes).length?{framework:'literal',committed:'yes',node:'22',platform:'linux',...changes}:{};
  const result=assessFit(input);assert.equal(result.ready,false);assert.ok(result.reasons.length>0);
 }
});
test('build exports only the onboarding allowlist and works without external scripts',async()=>{
 assert.ok(existsSync(new URL('scripts/build-onboarding.mjs',root)),'safe onboarding build is not implemented');
 const {buildOnboarding}=await import('../scripts/build-onboarding.mjs');
 const work=mkdtempSync(join(tmpdir(),'specgate-site-test-'));
 try{
  const output=join(work,'site');buildOnboarding(output);
  assert.deepEqual(readdirSync(output).sort(),['index.html','pilot-brief.md','quickstart.md','quickstart.sh','trust.md']);
  const html=readFileSync(join(output,'index.html'),'utf8');
  assert.match(html,/Guided pilot/);assert.match(html,/not.*compatibility guarantee/i);assert.match(html,/recorded/i);
  assert.ok(!html.includes('<!-- ONBOARDING_'));assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/type=["']file/i.test(html));
  assert.match(html,/<form id="waitlist-form" novalidate hidden>/);assert.match(html,/The waitlist is temporarily unavailable/);assert.ok(!/DATABASE_URL|postgres:/i.test(html));assert.equal(html.match(/<form/g).length,1);assert.match(html,/@qe-atlas\/specgate@0\.1\.0-rc\.2/);assert.ok(!/UNPUBLISHED|NO PUBLIC NPM/.test(html));assert.match(html,/free observe-only/);
  assert.ok(!html.includes('0.1.0-rc.1'));
  for(const name of ['quickstart.md','trust.md'])assert.ok(!readFileSync(join(output,name),'utf8').includes('0.1.0-rc.1'));
  assert.match(html,/Nothing is submitted/);assert.match(html,/not available/i);
  withVercelEnv(undefined,()=>assert.throws(()=>buildOnboarding(output),/exist/i));
 }finally{rmSync(work,{recursive:true,force:true});}
});
test('on Vercel a second build reuses the finished export without touching it',async()=>{
 const {buildOnboarding}=await import('../scripts/build-onboarding.mjs');
 const work=mkdtempSync(join(tmpdir(),'specgate-site-test-'));
 const previous=process.env.VERCEL;
 try{
  const output=join(work,'site');
  withVercelEnv('1',()=>{
   assert.equal(buildOnboarding(output),output);
   const first=snapshot(output);
   assert.equal(buildOnboarding(output),output);
   assert.deepEqual(snapshot(output),first);
  });
  assert.equal(process.env.VERCEL,previous,'VERCEL must be restored');
  withVercelEnv(undefined,()=>assert.throws(()=>buildOnboarding(output),/exist/i));
 }finally{rmSync(work,{recursive:true,force:true});}
});
test('on Vercel a build still refuses a directory that is not a finished export',async()=>{
 const {buildOnboarding}=await import('../scripts/build-onboarding.mjs');
 const work=mkdtempSync(join(tmpdir(),'specgate-site-test-'));
 try{
  const unrelated=join(work,'unrelated');mkdirSync(unrelated);writeFileSync(join(unrelated,'keep.txt'),'keep');
  const empty=join(work,'empty');mkdirSync(empty);
  withVercelEnv('1',()=>{
   assert.throws(()=>buildOnboarding(unrelated),/exist/i);
   assert.throws(()=>buildOnboarding(empty),/exist/i);
  });
  assert.deepEqual(readdirSync(unrelated),['keep.txt']);
  assert.equal(readFileSync(join(unrelated,'keep.txt'),'utf8'),'keep');
  assert.deepEqual(readdirSync(empty),[]);
 }finally{rmSync(work,{recursive:true,force:true});}
});
test('recorded examples identify their real CLI status without claiming consumer compatibility',()=>{
 const file=new URL('onboarding/recordings.json',root);assert.ok(existsSync(file),'recorded CLI examples are not implemented');
 const data=JSON.parse(readFileSync(file));assert.equal(data.schemaVersion,1);
 assert.deepEqual(data.examples.map(x=>[x.id,x.exitCode]),[['scan',0],['change',1],['unsupported',1]]);
 for(const e of data.examples){
  assert.match(e.sourceCommit,/^[a-f0-9]{40}$/);assert.match(e.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(e.report.schemaVersion);
  assert.equal(createHash('sha256').update(e.source).digest('hex'),e.sourceSha256,'Recorded source and digest must agree');
  if(e.report.sourceCommit)assert.equal(e.report.sourceCommit,e.sourceCommit,'Native report and recording commit must agree');
 }
 assert.equal(data.examples[0].report.routes[0].path,'/health');
 assert.ok(data.examples[1].report.findings.some(f=>f.code==='source-changed'));
 assert.equal(data.examples[2].report.complete,false);assert.ok(data.examples[2].report.gaps.length>0);
});
