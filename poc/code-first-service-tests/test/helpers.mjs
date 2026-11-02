import { applyTextEdits } from '../src/edits.mjs';
import { loadBaseline, loadBaselineSource, loadFixtureFiles, loadJson } from '../src/load.mjs';
import { buildArtifacts } from '../src/pipeline.mjs';

export const harnessSpecifier = '../fixture/ticket-desk/runtime.mjs';

export function artifactsFrom(files, sourceCommit = 'TEST') {
  return buildArtifacts({
    files,
    baseline: loadBaseline(),
    baselineSource: loadBaselineSource(),
    sourceCommit,
    harnessSpecifier,
  });
}

export function originalArtifacts() {
  return artifactsFrom(loadFixtureFiles());
}

export function editedArtifacts(editFile) {
  const files = applyTextEdits(loadFixtureFiles(), loadJson(editFile).edits);
  return { files, built: artifactsFrom(files) };
}
