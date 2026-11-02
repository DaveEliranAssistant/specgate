import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { commitFixture } from './fixture-git.mjs';
import { scanRepository as scanCommittedRepository } from '../src/scan.mjs';
const scanRepository = options => { commitFixture(options.root); return scanCommittedRepository(options); };
const module=await import('../src/generate.mjs').catch(()=>({}));
const generate=(...args)=>{assert.equal(typeof module.generateTests,'function','generateTests must exist');return module.generateTests(...args);};
export function reviewed(){return {schemaVersion:'specgate.scenarios/1',review:{reference:'requirements/tickets.md#approved-create'},scenarios:[{id:'tickets.create',classification:'approved_requirement',steps:[{method:'POST',path:'/tickets',body:{title:'normal'},expected:{status:201,bodyMatch:{ok:true}},extract:{ticketId:'id'}}]}]};}
async function report(t){const root=mkdtempSync(join(tmpdir(),'specgate-gen-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));writeFileSync(join(root,'src/app.mjs'),`import express from 'express'; export const app=express(); export function create(req,res){res.status(201).json({ok:true});} app.post('/tickets',create);`);return scanRepository({root,sources:['src']});}
test('compiles reviewed expectations without importing repository code or embedding credentials',async t=>{
 const scan=await report(t),doc=reviewed();doc.scenarios[0].steps[0].auth={bearerEnv:'TEST_API_TOKEN'};
 const text=generate(doc,scan);assert.match(text,/201/);assert.match(text,/TEST_API_TOKEN/);assert.match(text,/@playwright\/test/);assert(!text.includes('import express'));assert(!text.includes('syntheticCredential'));assert.match(text,/maxRedirects: 0/);
 const next=structuredClone(scan);next.routes[0].responseStatuses=[500];delete next.fingerprint;
 const {seal}=await import('../src/scan.mjs');assert.equal(generate(doc,seal(next)),text,'implementation status must not alter expectations');
});
test('refuses unreviewed observations, no assertions, unknown routes and unsafe paths',async t=>{
 const scan=await report(t);
 for(const mutate of [d=>delete d.review,d=>d.scenarios[0].classification='implementation_observation',d=>d.scenarios[0].steps[0].expected={},d=>d.scenarios[0].steps[0].path='/missing',d=>d.scenarios[0].steps[0].path='//evil.test',d=>d.scenarios[0].steps[0].path='/../tickets']){
 const doc=reviewed();mutate(doc);assert.throws(()=>generate(doc,scan));}
});
test('validates extraction ordering, env names, duplicate ids and structured assertion keys',async t=>{
 const scan=await report(t);
 for(const mutate of [d=>d.scenarios[0].steps[0].extract={__proto__:null,constructor:'id'},d=>d.scenarios[0].steps[0].auth={bearerEnv:'TOKEN;code'},d=>d.scenarios.push(structuredClone(d.scenarios[0])),d=>d.scenarios[0].steps[0].expected={status:201,unknown:true},d=>d.scenarios[0].steps[0].body={password:'inline-secret'}]){
 const doc=reviewed();mutate(doc);assert.throws(()=>generate(doc,scan));}
});
test('a partial or tampered scan cannot be used to generate a green suite',async t=>{
 const scan=await report(t);scan.complete=false;assert.throws(()=>generate(reviewed(),scan));
});
test('baseline strings cannot inject executable code',async t=>{
 const scan=await report(t),doc=reviewed();doc.scenarios[0].steps[0].body.title="'); process.exit(7); //";
 const text=generate(doc,scan);assert.match(text,/process\.exit\(7\)/);assert(!text.includes("test('"));
});
