import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDemo } from '../src/demo-fixture.mjs';
import { triage, parseSuggestions, exitCodeFor } from '../src/triage.mjs';
import { scrubIntent } from '../src/payload.mjs';
import { callProvider, PROVIDERS } from '../src/providers.mjs';
import { compareScans } from '../../../packages/specgate/src/gate.mjs';

let demo, unchanged;
const byRoute = (report, route, code) => report.findings.find(f => f.route === route && (!code || f.code === code));
before(async () => {
 demo = await buildDemo();
 unchanged = await buildDemo({});
});
after(() => { rmSync(demo.root, { recursive: true, force: true }); rmSync(unchanged.root, { recursive: true, force: true }); });
const noNet = async () => { throw new Error('network must not be used'); };
const reply = content => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });

test('without any model, deterministic labels cover break / approved / noise / needs_review', async () => {
 const { report } = await triage({ baseline: demo.baseline, current: demo.current, fetchImpl: noNet });
 assert.equal(report.model.status, 'not-configured');
 assert.equal(byRoute(report, 'POST /tickets').label, 'consumer_break');
 assert.equal(byRoute(report, 'DELETE /tickets/:id').label, 'consumer_break');
 assert.equal(byRoute(report, 'PATCH /tickets/:id').label, 'needs_review');
 assert.equal(byRoute(report, 'GET /health').label, 'noise');
 assert.equal(byRoute(report, 'GET /audit').label, 'needs_review');
 assert.equal(report.findings.find(f => f.file === 'src/helpers.mjs').label, 'noise');
});

test('triage never changes the core check result or exit semantics', async () => {
 const check = compareScans(demo.baseline, demo.current);
 const { report } = await triage({ baseline: demo.baseline, current: demo.current, provider: 'groq', send: true, env: { GROQ_API_KEY: 'x' },
  fetchImpl: reply({ suggestions: report0Ids().map(id => ({ id, label: 'noise', rationale: 'all noise' })) }) });
 assert.equal(report.check.passed, check.passed);
 assert.equal(report.check.findingCount, check.findings.length);
 assert.equal(exitCodeFor(report), 1);
 assert.equal(byRoute(report, 'POST /tickets').label, 'consumer_break', 'model cannot downgrade a rules label');
 assert.equal(byRoute(report, 'POST /tickets').modelSuggestion.agreesWithRules, false);
 const same = await triage({ baseline: unchanged.baseline, current: unchanged.current });
 assert.equal(same.report.check.passed, false, 'a new commit with comment edit still requires review');
});
function report0Ids() { return Array.from({ length: 8 }, (_, i) => `f${i + 1}`); }

test('reviewed intent file turns matching findings into approved_change deterministically', async () => {
 const del = demo.baseline.routes.find(r => r.method === 'DELETE').id;
 const intent = { schemaVersion: 'specgate.intent/1', review: { reference: 'CHANGELOG#v2' }, approved: [{ routeId: del, reference: 'CHANGELOG#delete' }] };
 const { report } = await triage({ baseline: demo.baseline, current: demo.current, intent });
 assert.equal(byRoute(report, 'DELETE /tickets/:id').label, 'approved_change');
 const post = demo.current.routes.find(r => r.method === 'POST').id;
 const narrow = { ...intent, approved: [{ routeId: post, keys: ['validation.optional'], reference: 'x' }] };
 assert.equal(byRoute((await triage({ baseline: demo.baseline, current: demo.current, intent: narrow })).report, 'POST /tickets').label, 'consumer_break', 'approval scoped to other keys does not cover maxLength');
 await assert.rejects(triage({ baseline: demo.baseline, current: demo.current, intent: { schemaVersion: 'specgate.intent/1', review: { reference: 'r' }, approved: [{ routeId: 'bad' }] } }), /intent/);
});

test('default payload is pseudonymized and carries no paths, hashes, commits, source or secrets', async () => {
 const intentText = 'Drop DELETE. key ghp_abcdefghijklmnop1234 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk <html><body>x</body></html> see https://internal.example/x mail a@b.co';
 const { payload } = await triage({ baseline: demo.baseline, current: demo.current, provider: 'gemini', intentText });
 const s = JSON.stringify(payload);
 for (const banned of ['src/', '/tickets', 'title', 'synthetic-demo-token', demo.current.sourceCommit, demo.current.fingerprint, demo.current.files[0].sha256, 'ghp_', 'eyJ', '<html', 'https://', 'a@b.co', demo.root])
  assert(!s.includes(banned), `payload leaked ${banned}`);
 assert.match(s, /route#1/); assert.match(s, /field#1/);
 assert.deepEqual(Object.keys(payload).sort(), ['changeIntent', 'findings', 'labels', 'schema']);
 for (const f of payload.findings) assert.deepEqual(Object.keys(f).sort(), ['code', 'deltas', 'id', 'route', 'rulesLabel']);
 const withIds = await triage({ baseline: demo.baseline, current: demo.current, provider: 'gemini', includeIdentifiers: true });
 assert.match(JSON.stringify(withIds.payload), /POST \/tickets/);
 assert(!('changeIntent' in withIds.payload), 'intent text only when supplied');
});

test('analysis gaps are locked: never sent to a model and never relabeled', async t => {
 const root = mkdtempSync(join(tmpdir(), 'specgate-triage-gap-')); t.after(() => rmSync(root, { recursive: true, force: true }));
 const g = await buildDemo({ titleMax: 80, healthName: 'health', keepDelete: true }, { root });
 // Inject a gap in the current report the same way the scanner would, then reseal.
 const { seal } = await import('../../../packages/specgate/src/scan.mjs');
 const { fingerprint, ...rest } = g.current;
 const current = seal({ ...rest, gaps: [{ file: 'src/service.mjs', line: 3, code: 'unsupported-statement' }], complete: false });
 const { report, payload } = await triage({ baseline: g.baseline, current, provider: 'groq', send: true, env: { GROQ_API_KEY: 'x' }, fetchImpl: reply({ suggestions: [{ id: 'f1', label: 'noise' }, { id: 'f2', label: 'noise' }, { id: 'f3', label: 'noise' }] }) });
 const gap = report.findings.find(f => f.code === 'analysis-gap');
 assert.equal(gap.label, 'needs_review'); assert.equal(gap.locked, true); assert.equal(gap.modelSuggestion, undefined);
 assert(!payload.findings.some(f => f.code === 'analysis-gap'));
});

test('model output is strictly validated; patches, unknown ids and labels are dropped', () => {
 const ids = new Set(['f1', 'f2']);
 const r = parseSuggestions('```json\n' + JSON.stringify({ suggestions: [{ id: 'f1', label: 'noise', rationale: 'x'.repeat(500), patch: 'expect(200)' }, { id: 'f1', label: 'noise' }, { id: 'f9', label: 'noise' }, { id: 'f2', label: 'heal' }] }) + '\n```', ids);
 assert.deepEqual(r.suggestions.map(s => Object.keys(s).sort()), [['id', 'label', 'rationale']]);
 assert.equal(r.suggestions[0].rationale.length, 200); assert.equal(r.rejected, 3);
 assert.deepEqual(parseSuggestions('not json', ids), { suggestions: [], rejected: 1 });
});

test('free-tier failures degrade to deterministic output with fixed error vocabulary', async () => {
 const cases = [[async () => new Response('slow down', { status: 429 }), 'rate-limited'], [async () => new Response('<html>oops secret</html>', { status: 503 }), 'http-503'],
  [async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, 'timeout'], [async () => new Response('{"weird":1}', { status: 200 }), 'unexpected-response-shape']];
 for (const [fetchImpl, error] of cases) {
  const { report } = await triage({ baseline: demo.baseline, current: demo.current, provider: 'groq', send: true, env: { GROQ_API_KEY: 'k' }, fetchImpl });
  assert.equal(report.model.status, 'unavailable'); assert.equal(report.model.error, error);
  assert.equal(byRoute(report, 'POST /tickets').label, 'consumer_break');
  assert(!JSON.stringify(report).includes('secret'));
 }
 assert.equal((await callProvider('groq', {}, { env: {}, fetchImpl: noNet })).error, 'missing-credentials');
 assert.equal((await callProvider('toString', {}, { env: {}, fetchImpl: noNet })).error, 'unknown-provider');
 assert.equal((await callProvider('cloudflare', {}, { env: { CLOUDFLARE_ACCOUNT_ID: '../x', CLOUDFLARE_API_TOKEN: 't' }, fetchImpl: noNet })).error, 'invalid-provider-config');
});

test('provider requests target the documented free-tier endpoints and keep keys in headers only', async () => {
 const env = { GROQ_API_KEY: 'KEY_G', GEMINI_API_KEY: 'KEY_M', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'KEY_C' };
 const seen = [];
 const fetchImpl = async (url, init) => { seen.push({ url, init }); return new Response('{}', { status: 200 }); };
 for (const name of Object.keys(PROVIDERS)) await callProvider(name, { findings: [] }, { env, fetchImpl });
 assert.match(seen[0].url, /^https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions$/);
 assert.match(seen[1].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[^/]+:generateContent$/);
 assert.match(seen[2].url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/ai\/run\/@cf\//);
 for (const s of seen) { assert(!s.url.includes('KEY_')); assert(!s.init.body.includes('KEY_')); assert.equal(s.init.redirect, 'error'); }
});

test('CLI: no-model default, dry-run payload without network, exit mirrors check', async t => {
 const dir = mkdtempSync(join(tmpdir(), 'specgate-triage-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
 writeFileSync(join(dir, 'b.json'), JSON.stringify(demo.baseline)); writeFileSync(join(dir, 'c.json'), JSON.stringify(demo.current));
 const bin = fileURLToPath(new URL('../bin/specgate-triage.mjs', import.meta.url));
 const run = (...a) => spawnSync(process.execPath, [bin, '--baseline', join(dir, 'b.json'), '--current', join(dir, 'c.json'), ...a], { encoding: 'utf8', env: { PATH: process.env.PATH } });
 const plain = run('--format', 'markdown');
 assert.equal(plain.status, 1); assert.match(plain.stdout, /consumer\\_break/); assert.equal(plain.stderr, '');
 const dry = run('--provider', 'cloudflare');
 assert.equal(dry.status, 1); assert.match(dry.stderr, /WOULD be/); assert.match(dry.stdout, /dry-run-payload-only/);
 const sendNoKey = run('--provider', 'groq', '--send');
 assert.equal(sendNoKey.status, 1); assert.match(sendNoKey.stdout, /missing-credentials/);
 assert.equal(run('--send').status, 2, '--send without a provider is refused');
 assert.equal(run('--provider', 'openai').status, 2);
 const same = spawnSync(process.execPath, [bin, '--baseline', join(dir, 'b.json'), '--current', join(dir, 'b.json')], { encoding: 'utf8' });
 assert.equal(same.status, 0);
});
