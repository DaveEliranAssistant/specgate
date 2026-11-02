import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fixtureHash } from '../src/hash.mjs';
import { loadBaseline, loadBaselineSource, loadFixtureFiles, pocRoot } from '../src/load.mjs';
import { buildArtifacts } from '../src/pipeline.mjs';

test('committed discovery, scenarios, and Playwright spec match a fresh build', () => {
  const files = loadFixtureFiles();
  const scenarioDoc = JSON.parse(readFileSync(join(pocRoot, 'generated/scenarios.json'), 'utf8'));
  const discovery = JSON.parse(readFileSync(join(pocRoot, 'generated/discovery.json'), 'utf8'));
  const spec = readFileSync(join(pocRoot, 'generated/api.spec.mjs'), 'utf8');
  const fresh = buildArtifacts({
    files,
    baseline: loadBaseline(),
    baselineSource: loadBaselineSource(),
    sourceCommit: scenarioDoc.sourceCommit,
    harnessSpecifier: '../fixture/ticket-desk/runtime.mjs',
  });
  const repoRoot = dirname(dirname(pocRoot));
  // A snapshot migration does not copy upstream Git ancestry. Verify the
  // recorded upstream revision AND every input/oracle/generated artifact instead.
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'docs/provenance/import-manifest.json'), 'utf8'));
  assert.equal(scenarioDoc.sourceCommit, manifest.syntheticScenarioSourceCommit);
  for (const entry of manifest.files.filter(f => f.path.startsWith('poc/code-first-service-tests/') && !f.path.startsWith('poc/code-first-service-tests/test/'))) {
    assert.equal(createHash('sha256').update(readFileSync(join(repoRoot, entry.path))).digest('hex'), entry.sha256, entry.path);
  }
  assert.equal(scenarioDoc.fixtureSha256, fixtureHash(files));
  assert.deepEqual(fresh.scenarioDoc, scenarioDoc);
  assert.deepEqual(fresh.discovery, discovery);
  assert.equal(withNewline(fresh.spec), spec);
  assert.equal(spec.includes("toBe(201)"), true);
  assert.equal(spec.includes('synthetic-token'), true);
});

function withNewline(value) {
  return value.endsWith('\n') ? value : `${value}\n`;
}
