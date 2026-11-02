import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commitFixture } from './fixture-git.mjs';
const module = await import('../src/scan.mjs').catch(() => ({}));
const scan = (...args) => { assert.equal(typeof module.scanRepository, 'function', 'scanRepository must exist'); commitFixture(args[0].root); return module.scanRepository(...args); };
const source = `import express from 'express';
export const app = express();
app.use(express.json());
const TOKEN = 'DO_NOT_LEAK_THIS_SECRET';
export function create(req, res) {
 const title = req.body.title;
 if (typeof title !== 'string') { res.status(400).json({ error: 'DO_NOT_LEAK_THIS_SECRET' }); return; }
 res.status(201).json({ ok: true });
}
app.post('/tickets', create);
`;
function repo(t, text = source) {
 const root = mkdtempSync(join(tmpdir(), 'specgate-scan-')); mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src/service.mjs'), text);
 t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
test('requires an explicit source scope', async t => { const root = repo(t); await assert.rejects(() => scan({ root }), /source scope/i); });
test('discovers source routes deterministically without exposing literals', async t => {
 const root = repo(t); const report = await scan({ root, sources: ['src'] });
 assert.equal(report.schemaVersion, 'specgate.scan/1'); assert.equal(report.routes.length, 1);
 assert.equal(report.routes[0].method, 'POST'); assert.equal(report.routes[0].path, '/tickets');
 assert.equal(report.routes[0].file, 'src/service.mjs'); assert.equal(report.complete, true);
 assert.equal(report.routes[0].validation[0].expectedType, 'string');
 assert(!JSON.stringify(report).includes('DO_NOT_LEAK')); assert(!JSON.stringify(report).includes(root));
 assert.deepEqual(await scan({ root, sources: ['src'] }), report);
});
test('scanned code is never executed', async t => {
 const root = repo(t, source + `\nimport {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(join(tmpdir(), 'specgate-MUST-NOT-EXIST'))}, 'bad');`);
 await scan({ root, sources: ['src'] }); assert.equal(existsSync(join(tmpdir(), 'specgate-MUST-NOT-EXIST')), false);
});
test('rejects escaping scopes and symlinked inputs', async t => {
 const root = repo(t); await assert.rejects(() => scan({ root, sources: ['../escape'] }), /scope/i);
 symlinkSync(join(root, 'src/service.mjs'), join(root, 'src/link.mjs'));
 await assert.rejects(() => scan({ root, sources: ['src'] }), /symlink/i);
});
test('enforces byte and file limits before parsing', async t => {
 const root = repo(t); await assert.rejects(() => scan({ root, sources: ['src'], limits: { maxFileBytes: 10 } }), /limit/i);
 writeFileSync(join(root, 'src/second.js'), source);
 await assert.rejects(() => scan({ root, sources: ['src'], limits: { maxFiles: 1 } }), /limit/i);
});
test('reports unsupported TypeScript and parse errors without echoing source', async t => {
 const root = repo(t); writeFileSync(join(root, 'src/typed.ts'), 'const secret: string = "DO_NOT_LEAK";');
 writeFileSync(join(root, 'src/broken.js'), 'const secret = "DO_NOT_LEAK" !');
 const report = await scan({ root, sources: ['src'] }); assert.equal(report.complete, false);
 assert(report.gaps.some(g => g.code === 'unsupported-language')); assert(report.gaps.some(g => g.code === 'parse-error'));
 assert(!JSON.stringify(report).includes('DO_NOT_LEAK'));
});
test('a zero-route scan cannot be complete', async t => { const root = repo(t, 'const x = 1;'); const report = await scan({ root, sources: ['src'] }); assert.equal(report.complete, false); assert(report.gaps.some(g => g.code === 'no-routes')); });
test('unknown middleware is partial, never evidence of missing auth', async t => {
 const root = repo(t, source.replace('app.post(\'/tickets\', create)', 'app.post(\'/tickets\', externalAuth, create)'));
 const report = await scan({ root, sources: ['src'] }); assert.equal(report.complete, false); assert.equal(report.routes[0].auth, 'unknown');
});
test('rejects a fake app not imported from Express', async t => {
 const root = repo(t, source.replace("import express from 'express';", 'function express() {}'));
 const report = await scan({ root, sources: ['src'] }); assert.equal(report.complete, false); assert(report.gaps.some(g => g.code === 'unverified-express-binding'));
});
test('duplicate registrations cannot silently overwrite route identity', async t => {
 const root = repo(t, source + "\napp.post('/tickets', create);"); const report = await scan({ root, sources: ['src'] });
 assert.equal(report.complete, false); assert(report.gaps.some(g => g.code === 'duplicate-route'));
});
