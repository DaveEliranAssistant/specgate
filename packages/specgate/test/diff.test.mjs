import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeRepository, scanRepository, canonical, hash } from '../src/scan.mjs';

const bin = resolve(import.meta.dirname, '../bin/specgate.mjs');
const FIXTURES = resolve(import.meta.dirname, 'fixtures/consumer-diff');
const ID = ['-c', 'user.name=SpecGate fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false'];
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (root, message) => { git(root, 'add', '--all'); git(root, ...ID, 'commit', '--quiet', '--allow-empty', '-m', message); return git(root, 'rev-parse', 'HEAD'); };
const cli = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

// Base revision on `main`, head revision on branch `pr`.
function fixtureRepo(t, name) {
 const root = mkdtempSync(join(tmpdir(), 'specgate-diff-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 git(root, 'init', '--quiet', '--initial-branch=main');
 cpSync(join(FIXTURES, name, 'base'), root, { recursive: true });
 commit(root, 'base');
 git(root, 'checkout', '--quiet', '-b', 'pr');
 rmSync(join(root, 'src'), { recursive: true, force: true });
 cpSync(join(FIXTURES, name, 'head'), root, { recursive: true });
 commit(root, 'head');
 return root;
}

const cases = readdirSync(FIXTURES).filter(n => existsSync(join(FIXTURES, n, 'expected.json'))).sort();
test('fixture set covers every classification and the false-positive/unsupported guards', () => {
 const all = cases.map(n => JSON.parse(readFileSync(join(FIXTURES, n, 'expected.json'), 'utf8')));
 const classes = new Set(all.flatMap(e => e.findings.map(f => f.classification)));
 assert.deepEqual([...classes].sort(), ['breaking', 'needs_review', 'non_breaking']);
 for (const required of ['refactor-only', 'unsupported-patterns', 'route-moved-to-router', 'additions-only']) assert(cases.includes(required), required);
});

for (const name of cases) {
 test(`fixture ${name}`, t => {
  const expected = JSON.parse(readFileSync(join(FIXTURES, name, 'expected.json'), 'utf8'));
  const root = fixtureRepo(t, name);
  // The base revision itself must be a complete scan unless the case is about a pre-existing gap.
  const run = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr');
  assert.equal(run.status, expected.exitCode, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.verdict, expected.verdict);
  const actual = [...new Set(report.findings.map(f => `${f.classification}:${f.code}`))].sort();
  assert.deepEqual(actual, [...new Set(expected.findings.map(f => `${f.classification}:${f.code}`))].sort());
  if (expected.exitCode === 0) assert.equal(report.summary.breaking + report.summary.needs_review, 0);
 });
}

test('report is sealed, stably ordered and byte-identical across runs', t => {
 const root = fixtureRepo(t, 'additions-only');
 const a = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr');
 const b = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr');
 assert.equal(a.stdout, b.stdout);
 const report = JSON.parse(a.stdout);
 const { fingerprint, ...payload } = report;
 assert.equal(hash(canonical(payload)), fingerprint);
 assert.equal(report.schemaVersion, 'specgate.diff/1');
 assert.equal(report.preview, true);
 assert.match(report.exitCodes[0], /NOT a compatibility guarantee/);
 assert.deepEqual(report.findings.map(f => f.id), report.findings.map((_, i) => `F${String(i + 1).padStart(3, '0')}`));
 assert(!a.stdout.includes(root), 'absolute checkout path must not be emitted');
});

test('literal values (tokens, enum members, response values) are never echoed', t => {
 for (const name of ['referenced-constant-changed', 'request-enum-value-removed', 'response-literal-value-changed']) {
  const root = fixtureRepo(t, name);
  const out = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr').stdout;
  for (const secret of ['fixture-token', 'rotated-token', "'high'", '"high"', 'invalid_title']) assert(!out.includes(secret), `${name} leaked ${secret}`);
 }
});

test('markdown summary states the verdict and that exit 0 is not a guarantee', t => {
 const root = fixtureRepo(t, 'refactor-only');
 const md = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr', '--format', 'markdown');
 assert.equal(md.status, 0, md.stderr);
 assert.match(md.stdout, /No breaking change found within the supported scope \(not a compatibility guarantee\)/);
 assert.match(md.stdout, /NOT a compatibility guarantee/);
 const broken = fixtureRepo(t, 'route-removed');
 const md2 = cli('diff', '--root', broken, '--source', 'src', '--base', 'main', '--head', 'pr', '--format', 'markdown');
 assert.equal(md2.status, 1);
 assert.match(md2.stdout, /## Breaking[\s\S]*route-removed.*GET \/health/);
});

test('default compares against the merge base, so later commits on main are not reported as removals', t => {
 const root = fixtureRepo(t, 'refactor-only');
 git(root, 'checkout', '--quiet', 'main');
 writeFileSync(join(root, 'src/app.mjs'), readFileSync(join(root, 'src/app.mjs'), 'utf8') + "\nexport function status(req, res) {\n  res.status(200).json({ up: true });\n}\napp.get('/status', status);\n");
 commit(root, 'main moves on');
 const mergeBased = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr');
 assert.equal(mergeBased.status, 0, mergeBased.stdout);
 assert.equal(JSON.parse(mergeBased.stdout).base.mode, 'merge-base');
 const tip = cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr', '--base-mode', 'tip');
 assert.equal(tip.status, 1);
 assert(JSON.parse(tip.stdout).findings.some(f => f.code === 'route-removed' && f.path === '/status'));
});

test('accepts commit SHAs and relative refs as well as branch names', t => {
 const root = fixtureRepo(t, 'route-removed');
 const head = git(root, 'rev-parse', 'pr'), base = git(root, 'rev-parse', 'main');
 const bySha = JSON.parse(cli('diff', '--root', root, '--source', 'src', '--base', base, '--head', head).stdout);
 const byRel = JSON.parse(cli('diff', '--root', root, '--source', 'src', '--base', 'pr~1', '--head', 'pr').stdout);
 assert.equal(bySha.head.comparedCommit, head); assert.equal(byRel.base.comparedCommit, base);
 assert.deepEqual(bySha.findings, byRel.findings);
});

test('unreadable input exits 2 without echoing arguments', t => {
 const root = fixtureRepo(t, 'route-removed');
 const bad = [
  ['--base', 'does-not-exist-PRIVATE', '--head', 'pr'],
  ['--base', '-PRIVATE', '--head', 'pr'],
  ['--base', 'main..PRIVATE', '--head', 'pr'],
  ['--base', 'main:PRIVATE', '--head', 'pr'],
  ['--base', 'main'],
  ['--base', 'main', '--head', 'pr', '--revision', 'HEAD'],
  ['--base', 'main', '--head', 'pr', '--base-mode', 'PRIVATE'],
 ];
 for (const args of bad) {
  const p = cli('diff', '--root', root, '--source', 'src', ...args);
  assert.equal(p.status, 2, args.join(' '));
  assert.equal(p.stdout, '');
  assert(!p.stderr.includes('PRIVATE'));
 }
 const missingScope = cli('diff', '--root', root, '--source', 'nope', '--base', 'main', '--head', 'pr');
 assert.equal(missingScope.status, 2);
 const notRepo = mkdtempSync(join(tmpdir(), 'specgate-norepo-')); t.after(() => rmSync(notRepo, { recursive: true, force: true }));
 assert.equal(cli('diff', '--root', notRepo, '--source', 'src', '--base', 'main', '--head', 'HEAD').status, 2);
});

test('diff output files use exclusive creation', t => {
 const root = fixtureRepo(t, 'route-removed'), output = join(root, 'diff.json');
 assert.equal(cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr', '--output', output).status, 1);
 assert.equal(JSON.parse(readFileSync(output, 'utf8')).verdict, 'breaking');
 assert.equal(cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr', '--output', output).status, 2);
});

test('diff never executes scanned code', t => {
 const root = fixtureRepo(t, 'refactor-only');
 const marker = join(tmpdir(), `specgate-diff-MUST-NOT-EXIST-${process.pid}`);
 writeFileSync(join(root, 'src/side-effect.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'bad');\n`);
 commit(root, 'side effect');
 cli('diff', '--root', root, '--source', 'src', '--base', 'main', '--head', 'pr');
 assert.equal(existsSync(marker), false);
});

test('contract mode leaves the sealed scan byte-identical to plain scan', async t => {
 const root = fixtureRepo(t, 'dependency-changed');
 const plain = await scanRepository({ root, sources: ['src'] });
 const withContracts = await analyzeRepository({ root, sources: ['src'], withContracts: true });
 assert.deepEqual(withContracts.scan, plain);
 assert(Object.keys(withContracts.contracts).length === plain.routes.length);
 assert(!JSON.stringify(plain).includes('"target"'));
});

test('existing check command is unaffected by diff (base revision scan still green)', t => {
 const root = fixtureRepo(t, 'refactor-only');
 git(root, 'checkout', '--quiet', 'main');
 const scan = cli('scan', '--root', root, '--source', 'src');
 assert.equal(scan.status, 0, scan.stderr);
 mkdirSync(join(root, 'out'));
 writeFileSync(join(root, 'out/baseline.json'), scan.stdout);
 assert.equal(cli('check', '--root', root, '--source', 'src', '--baseline', join(root, 'out/baseline.json')).status, 0);
});
