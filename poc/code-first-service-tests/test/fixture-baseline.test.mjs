import assert from 'node:assert/strict';
import test from 'node:test';
import { resetStore, startServer } from '../fixture/ticket-desk/runtime.mjs';
import { runScenario } from '../src/run-scenario.mjs';
import { originalArtifacts } from './helpers.mjs';

test('the synthetic service meets the reviewed baseline over loopback HTTP', async () => {
  const { scenarioDoc } = originalArtifacts();
  const server = await startServer();
  try {
    assert.match(server.baseURL, /^http:\/\/127\.0\.0\.1:\d+$/);
    for (const scenario of scenarioDoc.scenarios) {
      resetStore();
      await runScenario(server.baseURL, scenario, scenarioDoc.auth);
    }
  } finally {
    resetStore();
    await server.close();
  }
});
