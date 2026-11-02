import { discover } from './discover.mjs';
import { generateSpec } from './generate.mjs';
import { fixtureHash } from './hash.mjs';
import { compileScenarios } from './scenarios.mjs';

export function buildArtifacts({ files, baseline, baselineSource, baselinePath = 'baseline/behavior-baseline.json', sourceCommit, harnessSpecifier }) {
  const discovery = discover(files);
  const scenarioDoc = compileScenarios({
    discovery,
    baseline,
    baselineSource,
    baselinePath,
    sourceCommit,
    fixtureSha256: fixtureHash(files),
  });
  const spec = generateSpec(scenarioDoc, { harnessSpecifier });
  return { discovery, scenarioDoc, spec };
}
