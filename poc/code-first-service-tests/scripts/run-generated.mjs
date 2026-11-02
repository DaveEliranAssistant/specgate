import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pocRoot } from '../src/load.mjs';
import { collectTests, } from './prove.mjs';
import { runPlaywright } from './playwright-run.mjs';

const playwright = runPlaywright({
  config: join(pocRoot, 'playwright.config.mjs'),
  cwd: pocRoot,
});
const report = JSON.parse(readFileSync(join(pocRoot, '.tmp-proof/playwright-report.json'), 'utf8'));
const tests = collectTests(report);
mkdirSync(join(pocRoot, 'evidence'), { recursive: true });
writeFileSync(join(pocRoot, 'evidence/playwright-good.txt'), `${playwright.stdout}\n${playwright.stderr}`);
writeFileSync(join(pocRoot, 'evidence/playwright-good.json'), `${JSON.stringify({
  playwrightStatus: playwright.status,
  playwrightStats: report.stats,
  tests: tests.map((item) => ({ title: item.title, status: item.status })),
}, null, 2)}\n`);
console.log(playwright.stdout);
if (playwright.status !== 0) process.exitCode = playwright.status ?? 1;
