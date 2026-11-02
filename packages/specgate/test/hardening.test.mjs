import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {commitFixture} from './fixture-git.mjs';
import {scanRepository as scanCommittedRepository} from '../src/scan.mjs';
const scanRepository=options=>{commitFixture(options.root);return scanCommittedRepository(options);};
async function scan(t,text,limits){const root=mkdtempSync(join(tmpdir(),'specgate-hard-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));writeFileSync(join(root,'src/app.mjs'),text);return scanRepository({root,sources:['src'],limits});}
const prefix="import express from 'express'; export const app=express(); ";
test('discovers ordinary block-bodied inline Express handlers',async t=>{
 const result=await scan(t,prefix+"app.get('/health', (req,res)=>{ res.status(200).json({ok:true}); });");
 assert.equal(result.routes.length,1);assert.equal(result.routes[0].path,'/health');assert.equal(result.complete,true);
});
test('supports inline function expressions without executing them',async t=>{
 const result=await scan(t,prefix+"app.get('/health', function(req,res){ res.status(200).json({ok:true}); });");assert.equal(result.complete,true);assert.equal(result.routes.length,1);
});
test('unrecognized handler parameters remain a coverage gap',async t=>{
 const result=await scan(t,prefix+"function health(request,response){response.status(200).json({ok:true});} app.get('/health',health);");assert.equal(result.complete,false);
});
test('function expression handlers with expression bodies remain unsupported',async t=>{
 const result=await scan(t,prefix+"app.get('/health', (req,res)=>res.status(200).json({ok:true}));");assert.equal(result.complete,false);
});
test('literal unexpected typeof strings cannot leak as validation values',async t=>{
 const result=await scan(t,prefix+"function create(req,res){const x=req.body.title;if(typeof x !== 'SECRET_VALUE'){res.status(400).json({ok:false});return;}res.status(201).json({ok:true});}app.post('/tickets',create);");assert(!JSON.stringify(result).includes('SECRET_VALUE'));assert.equal(result.complete,false);
});
test('named generator and async handlers are explicit coverage gaps',async t=>{
 for(const fn of ["function* health(req,res){res.status(200).json({ok:true});}","async function health(req,res){res.status(200).json({ok:true});}"]){const result=await scan(t,prefix+fn+"app.get('/health',health);");assert.equal(result.complete,false);}
});
test('unsupported imported-call arguments prevent complete analysis',async t=>{
 const result=await scan(t,prefix+"import {save} from './store.mjs'; function create(req,res){const saved=save((()=>{throw new Error('boom');})());res.status(201).json({ok:true});}app.post('/tickets',create);");assert.equal(result.complete,false);
});
test('reversed request/response parameters cannot be recognized as supported',async t=>{
 const result=await scan(t,prefix+"function health(res,req){res.status(200).json({ok:true});}app.get('/health',health);");assert.equal(result.complete,false);
});
test('unbound continuation calls are a coverage gap',async t=>{
 const result=await scan(t,prefix+"function health(req,res){next();res.status(200).json({ok:true});}app.get('/health',health);");assert.equal(result.complete,false);
});
test('body comparisons against Bearer literals cannot become auth observations',async t=>{
 const result=await scan(t,prefix+"const TOKEN='example';function health(req,res){const value=req.body.title;if(value !== 'Bearer '+TOKEN){res.status(400).json({ok:false});return;}res.status(200).json({ok:true});}app.get('/health',health);");assert.equal(result.complete,false);assert.notEqual(result.routes[0].auth,'gate_observed');
});
test('bounds parser execution time rather than blocking indefinitely',async t=>{await assert.rejects(()=>scan(t,prefix+' '.repeat(100000),{timeoutMs:1}),/time limit/);});
test('binary inputs fail closed',async t=>{await assert.rejects(()=>scan(t,prefix+'\0'),/Binary/);});
