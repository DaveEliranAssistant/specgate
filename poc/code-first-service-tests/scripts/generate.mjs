import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBaseline, loadBaselineSource, loadFixtureFiles, pocRoot } from '../src/load.mjs';
import { buildArtifacts } from '../src/pipeline.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(dirname(dirname(root)));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const { discovery, scenarioDoc, spec } = buildArtifacts({
  files: loadFixtureFiles(),
  baseline: loadBaseline(),
  baselineSource: loadBaselineSource(),
  sourceCommit,
  harnessSpecifier: '../fixture/ticket-desk/runtime.mjs',
});
const generated = join(pocRoot, 'generated');
mkdirSync(generated, { recursive: true });
writeFileSync(join(generated, 'discovery.json'), `${JSON.stringify(discovery, null, 2)}\n`);
writeFileSync(join(generated, 'scenarios.json'), `${JSON.stringify(scenarioDoc, null, 2)}\n`);
writeFileSync(join(generated, 'api.spec.mjs'), spec.endsWith('\n') ? spec : `${spec}\n`);
console.log(`generated ${scenarioDoc.scenarios.length} scenarios at ${sourceCommit}`);
console.log(`fixture ${scenarioDoc.fixtureSha256}`);
