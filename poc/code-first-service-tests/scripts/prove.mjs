import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTextEdits } from '../src/edits.mjs';
import { specBlock } from '../src/generate.mjs';
import { loadBaseline, loadBaselineSource, loadFixtureFiles, loadJson, pocRoot } from '../src/load.mjs';
import { classifyRuns, planMaintenance } from '../src/maintain.mjs';
import { buildArtifacts } from '../src/pipeline.mjs';
import { runPlaywright } from './playwright-run.mjs';

const repoRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

export async function proveEditedFixture({ editPath, slug, evidenceLog, evidenceReport }) {
  const files = loadFixtureFiles();
  const baseline = loadBaseline();
  const baselineSource = loadBaselineSource();
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const harness = '../fixture/runtime.mjs';
  const options = { baseline, baselineSource, sourceCommit, harnessSpecifier: harness };
  const original = buildArtifacts({ ...options, files });
  const editedFiles = applyTextEdits(files, loadJson(editPath).edits);
  const edited = buildArtifacts({ ...options, files: editedFiles });
  if (original.spec !== edited.spec) throw new Error('Edited source changed the generated tests');
  if (JSON.stringify(original.scenarioDoc.scenarios) !== JSON.stringify(edited.scenarioDoc.scenarios)) {
    throw new Error('Edited source changed scenario assertions');
  }
  const plan = planMaintenance({
    previousDiscovery: buildArtifacts({ ...options, files, harnessSpecifier: '../fixture/ticket-desk/runtime.mjs' }).discovery,
    nextDiscovery: buildArtifacts({ ...options, files: editedFiles, harnessSpecifier: '../fixture/ticket-desk/runtime.mjs' }).discovery,
    scenarioDoc: buildArtifacts({ ...options, files, harnessSpecifier: '../fixture/ticket-desk/runtime.mjs' }).scenarioDoc,
  });
  const work = join(pocRoot, '.tmp-proof', slug);
  rmSync(work, { recursive: true, force: true });
  const fixtureDir = join(work, 'fixture');
  const generatedDir = join(work, 'generated');
  mkdirSync(fixtureDir, { recursive: true });
  mkdirSync(generatedDir, { recursive: true });
  const byPath = new Map(editedFiles.map((file) => [file.path, file.source]));
  writeFileSync(join(fixtureDir, 'service.mjs'), byPath.get('fixture/ticket-desk/service.mjs'));
  writeFileSync(join(fixtureDir, 'store.mjs'), byPath.get('fixture/ticket-desk/store.mjs'));
  writeFileSync(join(fixtureDir, 'runtime.mjs'), readFileSync(join(pocRoot, 'fixture/ticket-desk/runtime.mjs')));
  writeFileSync(join(generatedDir, 'api.spec.mjs'), edited.spec.endsWith('\n') ? edited.spec : `${edited.spec}\n`);
  const jsonOut = join(work, 'playwright-report.json');
  const configPath = join(work, 'playwright.config.mjs');
  writeFileSync(configPath, `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: ${JSON.stringify(generatedDir)},
  testMatch: 'api.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: ${JSON.stringify(join(work, 'output'))},
  reporter: [['line'], ['json', { outputFile: ${JSON.stringify(jsonOut)} }]],
});
`);
  const playwright = runPlaywright({ config: configPath, cwd: pocRoot });
  mkdirSync(join(pocRoot, 'evidence'), { recursive: true });
  writeFileSync(join(pocRoot, evidenceLog), `${playwright.stdout}\n${playwright.stderr}`);
  if (!existsSync(jsonOut)) {
    console.error(playwright.stdout);
    console.error(playwright.stderr);
    throw new Error('Playwright did not write a JSON report');
  }
  const reportJson = JSON.parse(readFileSync(jsonOut, 'utf8'));
  const tests = collectTests(reportJson);
  const failed = tests.filter((item) => item.status === 'failed' || item.status === 'timedOut').map((item) => item.title).sort();
  const predicted = plan.impacted
    .filter((item) => item.predictedResult === 'fail' && item.changeClass === 'genuine_regression')
    .map((item) => item.scenarioId)
    .sort();
  const classifications = failed.map((title) => {
    const found = tests.find((item) => item.title === title);
    return classifyRuns([{ scenarioId: title, result: found.status === 'timedOut' ? 'timedOut' : 'failed', error: found.error }]);
  });
  const summary = {
    slug,
    sourceCommit,
    playwrightStatus: playwright.status,
    playwrightStats: reportJson.stats,
    tests: tests.map((item) => ({ title: item.title, status: item.status })),
    predictedFailureIds: predicted,
    actualFailureIds: failed,
    classifications,
    specUnchanged: true,
    scenarioAssertionsUnchanged: true,
    createPositiveStillExpects201: specBlock(edited.spec, 'tickets.create.positive').includes('toBe(201)'),
  };
  writeFileSync(join(pocRoot, evidenceReport), `${JSON.stringify(summary, null, 2)}\n`);
  const problems = [];
  if (playwright.status === 0) problems.push('Playwright passed; the seeded or diffed behavior was not caught');
  if (JSON.stringify(failed) !== JSON.stringify(predicted)) {
    problems.push(`Failure ids ${failed.join(',')} did not match predicted ${predicted.join(',')}`);
  }
  if (!tests.some((item) => item.status === 'passed')) problems.push('No test passed; this looks like harness breakage');
  if (classifications.some((item) => item.changeClass !== 'genuine_regression')) {
    problems.push(`A failure was not classified as a genuine regression: ${JSON.stringify(classifications)}`);
  }
  if (!summary.createPositiveStillExpects201) problems.push('Create expectation no longer requires 201');
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`${slug}: ${reportJson.stats.unexpected} failed, ${reportJson.stats.expected} passed, predictions matched`);
  }
  return summary;
}

export function collectTests(report) {
  const tests = [];
  const visit = (suite) => {
    for (const child of suite.suites ?? []) visit(child);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const result = test.results?.at(-1);
        tests.push({
          title: spec.title,
          status: result?.status ?? test.status,
          error: (result?.errors ?? []).map((error) => error.message ?? error.stack ?? '').join('\n'),
        });
      }
    }
  };
  for (const suite of report.suites ?? []) visit(suite);
  return tests;
}

export async function captureClosedPortError() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) });
    throw new Error(`Closed port ${port} accepted a connection`);
  } catch (error) {
    return {
      port,
      message: error.message,
      code: error.cause?.code ?? null,
      cause: error.cause?.message ?? null,
    };
  }
}
