import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: resolve(root, 'generated'),
  testMatch: 'api.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30000,
  outputDir: resolve(root, '.tmp-proof/playwright-output'),
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(root, '.tmp-proof/playwright-report.json') }],
  ],
});
