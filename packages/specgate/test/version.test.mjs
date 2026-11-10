import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = resolve(import.meta.dirname, '../bin/specgate.mjs');
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
test('--version prints the package.json version', () => {
 const p = run('--version'); assert.equal(p.status, 0, p.stderr); assert.equal(p.stdout, `${version}\n`);
});
test('--help names the package.json version, not a stale hardcoded one', () => {
 const p = run('--help'); assert.equal(p.status, 0, p.stderr);
 assert.equal(p.stdout.split('\n')[0], `SpecGate ${version} — code-first local change gate (no OpenAPI input)`);
 assert.match(p.stdout, /^diff --root/m);
});
