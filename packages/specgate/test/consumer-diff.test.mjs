import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { commitFixture } from './fixture-git.mjs';
import { diffRepository } from '../src/consumer-diff.mjs';
import { canonical, hash } from '../src/scan.mjs';
const source=readFileSync(new URL('./fixtures/consumer-diff/base.mjs',import.meta.url),'utf8');
const cli=new URL('../bin/specgate.mjs',import.meta.url).pathname;
function fixture(t,head) {
 const root=mkdtempSync(join(tmpdir(),'consumer-diff-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'src'));
 const file=join(root,'src/app.mjs');writeFileSync(file,source);commitFixture(root);
 const base=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 writeFileSync(file,head);commitFixture(root);
 return {root,sources:['src'],base,head:'HEAD'};
}
const cases=[
 ['route-removed',source.replace("app.get('/tickets/:id', read);",'')],
 ['method-removed',source.replace("app.post('/tickets', read);","app.put('/tickets', read);")],
 ['path-param-renamed',source.replace('/tickets/:id','/tickets/:ticketId')],
 ['path-param-added',source.replace("app.post('/tickets', read)","app.post('/tickets/:id', read)")],
 ['required-request-field-added',source.replace(' res.status(200)'," const name = req.body.name;\n if (typeof name !== 'string') { res.status(400).json({ error: 'bad' }); return; }\n res.status(200)")],
 ['response-field-removed',source.replace(", title: 'example'",'')],
 ['response-field-type-changed',source.replace('id: 1',"id: 'one'")],
 ['status-codes-changed',source.replace('status(200)','status(201)')],
];
for(const [code,head] of cases)test(code,async t=>{
 const report=await diffRepository(fixture(t,head));assert.equal(report.passed,false);assert(report.findings.some(f=>f.code===code&&f.classification==='breaking'));
 const {fingerprint,...payload}=report;assert.equal(fingerprint,hash(canonical(payload)));
});
test('comments, handler renames, line and route/property reordering do not break',async t=>{
 const head=source.replaceAll('read','renamed').replace('id: 1, title:', 'title:').replace("'example' }","'example', id: 1 }").replace("app.get('/tickets/:id', renamed);\napp.post('/tickets', renamed);","app.post('/tickets', renamed);\napp.get('/tickets/:id', renamed);");
 const opts=fixture(t,'// comment\n\n'+head);const result=await diffRepository(opts);assert.equal(result.passed,true);assert.deepEqual(result.findings,[]);assert.deepEqual(await diffRepository(opts),result);
});
test('route and response field additions are non-breaking',async t=>{
 const r=await diffRepository(fixture(t,source.replace('id: 1','extra: true, id: 1')+"\napp.get('/new', read);"));assert.equal(r.passed,true);assert(r.findings.every(f=>f.classification==='non_breaking'));
});
for(const [name,head] of [
 ['dynamic path',source.replace("'/tickets/:id'",'process.env.ROUTE')],
 ['opaque response',source.replace("{ id: 1, title: 'example' }",'payload')],
 ['dependency',source.replace("function read", "import { load } from './db.mjs';\nfunction read").replace(' res.status(200)', ' const payload = load();\n res.status(200)')],
 ['typescript',source+'\nconst x: string = "x";'],
])test(name+' requires review in either revision',async t=>{
 const opts=fixture(t,head);let r=await diffRepository(opts);assert.equal(r.passed,false);assert(r.findings.some(f=>f.code==='analysis-gap'));
 r=await diffRepository({...opts,base:'HEAD',head:opts.base});assert.equal(r.passed,false);assert(r.findings.some(f=>f.code==='analysis-gap'&&f.side==='base'));
});
test('CLI resolves branch refs, ignores dirty source, emits summary and uses 0/1/2',t=>{
 const opts=fixture(t,source);writeFileSync(join(opts.root,'src/app.mjs'),'throw new Error("must not execute")');
 const run=(args)=>spawnSync(process.execPath,[cli,'diff','--root',opts.root,'--source','src','--base',opts.base,'--head','HEAD',...args],{encoding:'utf8'});
 let r=run([]);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).headCommit,opts.base);
 r=run(['--format','markdown']);assert.equal(r.status,0);assert.match(r.stdout,/NOT a compatibility guarantee/);
 r=spawnSync(process.execPath,[cli,'diff','--root',opts.root,'--source','src','--base','missing','--head','HEAD'],{encoding:'utf8'});assert.equal(r.status,2);
 writeFileSync(join(opts.root,'src/app.mjs'),source.replace('status(200)','status(201)'));commitFixture(opts.root);r=run([]);assert.equal(r.status,1);
});
test('enum changes and duplicate-status shapes stay unknown',async t=>{
 for(const guard of ["const state = req.body.state; if (state !== 'a' && state !== 'b') { res.status(400).json({ error: 'bad' }); return; }", "const name = req.body.name; if (typeof name !== 'string') { res.status(200).json({ error: 'bad' }); return; }"]) {
  const r=await diffRepository(fixture(t,source.replace(' res.status(200)',guard+'\n res.status(200)')));assert.equal(r.passed,false);assert(r.findings.some(f=>f.code==='analysis-gap'));
 }
});
test('ref resolver preserves selected repository under inherited Git selectors',async t=>{
 const selected=fixture(t,source.replace('status(200)','status(201)'));
 const foreign=fixture(t,source);
 const env={...process.env,GIT_DIR:join(foreign.root,'.git'),GIT_WORK_TREE:foreign.root};
 const result=spawnSync(process.execPath,[cli,'diff','--root',selected.root,'--source','src','--base',selected.base,'--head','HEAD'],{encoding:'utf8',env});
 assert.equal(result.status,1);assert(JSON.parse(result.stdout).findings.some(f=>f.code==='status-codes-changed'));
});
