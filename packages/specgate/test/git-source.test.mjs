import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,renameSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scanRepository} from '../src/scan.mjs';
const code="import express from 'express';const app=express();function health(req,res){res.status(200).json({ok:true});}app.get('/health',health);";
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();}
function repo(t){const root=mkdtempSync(join(tmpdir(),'specgate-git-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));writeFileSync(join(root,'src/app.mjs'),code);git(root,'init','--quiet');git(root,'add','.');git(root,'-c','user.name=SpecGate fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture');return root;}
test('pinned Git input ignores uncommitted source substitutions',async t=>{
 const root=repo(t),commit=git(root,'rev-parse','HEAD');writeFileSync(join(root,'src/app.mjs'),code.replace('/health','/wrong'));
 const report=await scanRepository({root,sources:['src'],revision:'HEAD'});assert.equal(report.inputMode,'git-revision');assert.equal(report.sourceCommit,commit);assert.equal(report.routes[0].path,'/health');
});
test('Git mode never traverses substituted working-tree directories',async t=>{
 const root=repo(t);renameSync(join(root,'src'),join(root,'original'));symlinkSync(join(root,'original'),join(root,'src'));
 const report=await scanRepository({root,sources:['src'],revision:'HEAD'});assert.equal(report.complete,true);assert.equal(report.inputMode,'git-revision');
});
test('rejects committed symlinks rather than following their targets',async t=>{
 const root=repo(t);symlinkSync('app.mjs',join(root,'src/link.mjs'));git(root,'add','.');git(root,'-c','user.name=SpecGate fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','link');
 await assert.rejects(()=>scanRepository({root,sources:['src'],revision:'HEAD'}),/symlink/i);
});
test('revision must be HEAD or an exact commit identifier; missing scopes fail',async t=>{
 const root=repo(t);await assert.rejects(()=>scanRepository({root,sources:['src'],revision:'--help'}),/revision/i);
 await assert.rejects(()=>scanRepository({root,sources:['missing'],revision:'HEAD'}),/scope/i);
});
test('Git acquisition has a separate aggregate deadline',async t=>{const root=repo(t);await assert.rejects(()=>scanRepository({root,sources:['src'],limits:{acquisitionTimeoutMs:1}}),/acquisition time limit/);});
test('Git mode retains the same source byte limits',async t=>{const root=repo(t);await assert.rejects(()=>scanRepository({root,sources:['src'],revision:'HEAD',limits:{maxFileBytes:10}}),/limit/i);});
