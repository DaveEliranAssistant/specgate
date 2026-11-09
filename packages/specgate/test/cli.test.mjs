import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = resolve(import.meta.dirname, '../bin/specgate.mjs');
const text = `import express from 'express'; export const app = express(); export function health(req, res) { res.status(200).json({ok:true}); } app.get('/health', health);`;
function repo(t) { const root = mkdtempSync(join(tmpdir(), 'specgate-cli-')); mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/app.mjs'), text); t.after(() => rmSync(root, {recursive:true,force:true})); return root; }
import { commitFixture } from './fixture-git.mjs';
const cli = (...args) => { const index=args.indexOf('--root'); if(index>=0 && args[index+1])commitFixture(args[index+1]); return spawnSync(process.execPath, [bin, ...args], {encoding:'utf8'}); };
test('scan is a deterministic JSON CLI with no OpenAPI input', t => {
 const root=repo(t); const a=cli('scan','--root',root,'--source','src'); assert.equal(a.status,0,a.stderr); const doc=JSON.parse(a.stdout); assert.equal(doc.routes[0].path,'/health');
 assert.equal(cli('scan','--root',root,'--source','src').stdout,a.stdout);
 const md=cli('scan','--root',root,'--source','src','--format','markdown'); assert.equal(md.status,0); assert.match(md.stdout,/GET/);
});
test('unknown arguments and missing values exit 2, never echo private values', t => {
 const root=repo(t); for (const args of [['--bad','SUPER_PRIVATE'],['--format','xml'],['--root']]) {
 const p=cli('scan','--root',root,'--source','src',...args); assert.equal(p.status,2); assert(!p.stderr.includes('SUPER_PRIVATE')); }
});
test('partial scan and empty scan exit 1 instead of green', t => {
 const root=repo(t); writeFileSync(join(root,'src/x.ts'),'const x: string = "x";'); assert.equal(cli('scan','--root',root,'--source','src').status,1);
 writeFileSync(join(root,'empty.js'),'const x=1;'); assert.equal(cli('scan','--root',root,'--source','empty.js').status,1);
});
test('check passes identical snapshots and detects removals without changing baseline', t => {
 const root=repo(t); const a=cli('scan','--root',root,'--source','src'); const baseline=join(root,'baseline.json'); writeFileSync(baseline,a.stdout);
 assert.equal(cli('check','--root',root,'--source','src','--baseline',baseline).status,0);
 writeFileSync(join(root,'src/app.mjs'),text.replace("app.get('/health', health);",''));
 const p=cli('check','--root',root,'--source','src','--baseline',baseline); assert.equal(p.status,1); assert(JSON.parse(p.stdout).findings.some(f=>f.code==='route-removed')); assert.equal(readFileSync(baseline,'utf8'),a.stdout);
});
test('even undiscovered behavior changes require review through source hashes', t => {
 const root=repo(t); const a=cli('scan','--root',root,'--source','src'); const baseline=join(root,'baseline.json'); writeFileSync(baseline,a.stdout);
 writeFileSync(join(root,'src/app.mjs'),text.replace('ok:true','ok:false'));
 const p=cli('check','--root',root,'--source','src','--baseline',baseline); assert.equal(p.status,1); assert(JSON.parse(p.stdout).findings.some(f=>f.code==='source-changed'));
});
test('rejects tampered, partial and scope-mismatched baselines', t => {
 const root=repo(t); const a=JSON.parse(cli('scan','--root',root,'--source','src').stdout); const baseline=join(root,'baseline.json');
 a.routes=[]; writeFileSync(baseline,JSON.stringify(a)); assert.equal(cli('check','--root',root,'--source','src','--baseline',baseline).status,2);
 writeFileSync(baseline,cli('scan','--root',root,'--source','src/app.mjs').stdout); assert.equal(cli('check','--root',root,'--source','src','--baseline',baseline).status,2);
});
test('output files use exclusive creation and never overwrite an accepted baseline', t=> {
 const root=repo(t), output=join(root,'scan.json'); const a=cli('scan','--root',root,'--source','src','--output',output); assert.equal(a.status,0,a.stderr);
 assert.equal(cli('scan','--root',root,'--source','src','--output',output).status,2); assert.equal(JSON.parse(readFileSync(output,'utf8')).complete,true);
});
test('scan CLI isolates Git configuration and repository environment', t=> {
 const root=repo(t),other=repo(t);
 writeFileSync(join(other,'src/app.mjs'),text.replace('/health','/substituted'));
 commitFixture(root);commitFixture(other);
 const clean=spawnSync(process.execPath,[bin,'scan','--root',root,'--source','src'],{encoding:'utf8'});
 const inherited=spawnSync(process.execPath,[bin,'scan','--root',root,'--source','src'],{
  encoding:'utf8',env:{...process.env,GIT_DIR:join(other,'.git'),GIT_WORK_TREE:other,
   GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.repositoryformatversion',GIT_CONFIG_VALUE_0:'999',
   GIT_LITERAL_PATHSPECS:'0',GIT_GLOB_PATHSPECS:'1',GIT_TRACE:'1'}
 });
 assert.equal(clean.status,0,clean.stderr);assert.equal(inherited.status,0,inherited.stderr);
 assert.equal(inherited.stdout,clean.stdout);
 assert.equal(inherited.stderr,'');
});
