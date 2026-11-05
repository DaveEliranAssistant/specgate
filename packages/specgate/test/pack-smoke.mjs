import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { commitFixture } from './fixture-git.mjs';
const pkg=resolve(import.meta.dirname,'..');
const work=mkdtempSync(join(tmpdir(),'specgate-pack-'));
try {
 const [packed]=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',work],{cwd:pkg,encoding:'utf8'}));
 assert(packed.files.every(f=>f.path==='package.json'||['LICENSE','README.md','SECURITY.md','NOTICE.md'].includes(f.path)||f.path.startsWith('bin/')||f.path.startsWith('src/')||f.path.startsWith('node_modules/acorn/')),'Only allowlisted runtime and Acorn files may be packed');
 assert(packed.files.some(f=>f.path==='LICENSE'),'SpecGate MIT license must be included');
 assert(packed.files.some(f=>f.path==='node_modules/acorn/LICENSE'),'Bundled dependency license must be included');
 assert(packed.files.some(f=>f.path==='src/parser-worker.mjs'));
 const archive=join(work,packed.filename), install=join(work,'install'),root=join(work,'service');mkdirSync(install);mkdirSync(join(root,'src'),{recursive:true});
 execFileSync('npm',['install','--prefix',install,'--cache',join(work,'empty-cache'),'--offline','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',archive],{encoding:'utf8'});
 const bin=join(install,'node_modules/@qe-atlas/specgate/bin/specgate.mjs');
 const source="import express from 'express'; export const app=express(); app.get('/health',(req,res)=>{res.status(200).json({ok:true});});";
 writeFileSync(join(root,'src/app.mjs'),source);
 const cli=(...args)=>{commitFixture(root);return spawnSync(process.execPath,[bin,...args],{encoding:'utf8',timeout:20000});};
 const first=cli('scan','--root',root,'--source','src');assert.equal(first.status,0,first.stderr);const baseline=join(work,'baseline.json');writeFileSync(baseline,first.stdout);
 assert.equal(cli('check','--root',root,'--source','src','--baseline',baseline).status,0);
 writeFileSync(join(root,'src/app.mjs'),source.replace('ok:true','ok:false'));
 const changed=cli('check','--root',root,'--source','src','--baseline',baseline);assert.equal(changed.status,1);assert(JSON.parse(changed.stdout).findings.some(f=>f.code==='source-changed'));
 const scenarios=join(work,'reviewed.json');writeFileSync(scenarios,JSON.stringify({schemaVersion:'specgate.scenarios/1',review:{reference:'requirements/health.md'},scenarios:[{id:'health.ok',classification:'approved_requirement',steps:[{method:'GET',path:'/health',expected:{status:200,bodyEquals:{ok:true}}}]}]}));
 const output=join(work,'api.spec.mjs');assert.equal(cli('generate','--root',root,'--source','src','--scenarios',scenarios,'--output',output).status,0);
 assert(readFileSync(output,'utf8').includes('bodyEquals'));assert.equal(cli('scan','--root',root,'--source','../escape').status,2);
 console.log(JSON.stringify({passed:true,package:packed.name,version:packed.version,archiveSha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),runtimeFiles:packed.files.length,offlineInstall:true,scan:true,unchangedGate:true,changedGate:true,generate:true,unsafePathRefused:true},null,2));
 if(process.env.SPECGATE_KEEP_ARCHIVE){const {copyFileSync}=await import('node:fs');copyFileSync(archive,process.env.SPECGATE_KEEP_ARCHIVE);}
} finally {rmSync(work,{recursive:true,force:true});}
