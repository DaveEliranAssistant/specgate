import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
test('all imported source bytes match the pinned upstream snapshot',async()=>{
 const manifest=JSON.parse(await readFile(resolve(root,'docs/provenance/import-manifest.json'),'utf8'));
 assert.equal(manifest.sourceCommit,'b24b96daf16814b11b6d225d3b502f4acfb7a2c2');
 assert.equal(manifest.files.length,77);
 assert.equal(new Set(manifest.files.map(f=>f.path)).size,manifest.files.length);
 assert.deepEqual(manifest.adaptations.map(f=>f.path),['poc/code-first-service-tests/test/artifacts.test.mjs','packages/specgate/package.json','packages/specgate/README.md','packages/specgate/package-lock.json','packages/specgate/NOTICE.md','packages/specgate/SECURITY.md','packages/specgate/test/pack-smoke.mjs','packages/specgate/src/git-source.mjs','packages/specgate/test/cli.test.mjs','packages/specgate/test/git-source.test.mjs','packages/specgate/src/cli.mjs','packages/specgate/src/engine/discover.mjs','packages/specgate/src/parser-worker.mjs','packages/specgate/src/scan.mjs','packages/specgate/test/scan.test.mjs']);
 for(const file of manifest.files){
  const path=resolve(root,file.path);assert.ok(path.startsWith(root+sep));
  assert.match(file.path,/^(packages\/specgate\/|poc\/code-first-service-tests\/|docs\/(reports|plans)\/)/);
  const bytes=await readFile(path);const adaptation=manifest.adaptations.find(f=>f.path===file.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),adaptation?.sha256??file.sha256,file.path);
 }
});
test('product repository is private-package oriented with a standalone quality workflow',async()=>{
 const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));assert.equal(pkg.private,true);assert.equal(pkg.name,'specgate-product');
 const workflow=await readFile(resolve(root,'.github/workflows/quality.yml'),'utf8');
 assert.match(workflow,/node: \[22, 24\]/);assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/npm run test:pack/);assert.doesNotMatch(workflow,/pull_request_target|secrets\./);
 const ignore=await readFile(resolve(root,'.gitignore'),'utf8');assert.match(ignore,/\.env/);assert.match(ignore,/\.vercel/);
});
