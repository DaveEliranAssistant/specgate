import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRuns, planMaintenance } from '../src/maintain.mjs';
import { editedArtifacts, originalArtifacts } from './helpers.mjs';

const original = originalArtifacts();

function plan(nextDiscovery, extras = {}) {
  return planMaintenance({
    previousDiscovery: original.discovery,
    nextDiscovery,
    scenarioDoc: original.scenarioDoc,
    ...extras,
  });
}

test('classifyRuns separates regressions, setup failures, and flakiness without editing assertions', () => {
  assert.equal(classifyRuns([{ scenarioId: 'health.ok.positive', result: 'failed', error: 'Expected: 200\nReceived: 500' }]).changeClass, 'genuine_regression');
  assert.equal(classifyRuns([{ scenarioId: 'health.ok.positive', result: 'failed', error: 'connect ECONNREFUSED 127.0.0.1:9', errorCode: 'ECONNREFUSED' }]).changeClass, 'fixture_or_setup_breakage');
  assert.equal(classifyRuns([{ scenarioId: 'health.ok.positive', result: 'failed', error: 'Cannot find module \'./service.mjs\'' }]).changeClass, 'fixture_or_setup_breakage');
  assert.equal(classifyRuns([
    { scenarioId: 'health.ok.positive', result: 'passed' },
    { scenarioId: 'health.ok.positive', result: 'failed', error: 'Expected: 200' },
  ]).changeClass, 'flakiness');
  assert.equal(classifyRuns([{ scenarioId: 'health.ok.positive', result: 'timedOut', error: 'Timeout 30000ms exceeded' }]).changeClass, 'flakiness');
  assert.equal(classifyRuns([{ scenarioId: 'health.ok.positive', result: 'passed' }]).changeClass, null);
});

test('a mixed runtime result is flakiness and drops the assertion patch', () => {
  const sample = editedArtifacts('maintenance/sample-edits.json');
  const report = plan(sample.built.discovery, {
    runs: [
      { scenarioId: 'tickets.create.boundary-title-max', result: 'failed', error: 'Expected: 201\nReceived: 400' },
      { scenarioId: 'tickets.create.boundary-title-max', result: 'passed' },
    ],
  });
  const impact = report.impacted.find((item) => item.scenarioId === 'tickets.create.boundary-title-max');
  assert.equal(impact.changeClass, 'flakiness');
  assert.equal(impact.recommendedAction, 'rerun');
  assert.equal(report.assertionPatches.some((patch) => patch.scenarioId === impact.scenarioId), false);
});

test('parse errors, missing isolation, and missing JSON parsing are fixture breakage', () => {
  const broken = structuredClone(original.discovery);
  broken.files[0].parseError = 'Unexpected token';
  const parsed = plan(broken);
  assert.equal(parsed.impacted.every((item) => item.changeClass === 'fixture_or_setup_breakage'), true);
  assert.equal(parsed.assertionPatches.length, 0);

  const noReset = structuredClone(original.discovery);
  noReset.exports = noReset.exports.filter((item) => item.name !== 'resetStore');
  const reset = plan(noReset);
  assert.equal(reset.impacted.length, 21);
  assert.equal(reset.impacted.every((item) => item.changeClass === 'fixture_or_setup_breakage'), true);

  const noJson = structuredClone(original.discovery);
  noJson.setups = noJson.setups.filter((item) => item.kind !== 'json-parser');
  const json = plan(noJson);
  assert.equal(json.impacted.every((item) => item.changeClass === 'fixture_or_setup_breakage'), true);
  assert.equal(json.impacted.some((item) => item.scenarioId === 'health.ok.positive'), false);
});

test('a moved collaborator or removed response field is not silently accepted', () => {
  const rewired = structuredClone(original.discovery);
  const create = rewired.routes.find((route) => route.method === 'POST');
  create.dependencies = [{ ...create.dependencies[0], module: './other.mjs' }];
  const wiring = plan(rewired);
  assert.equal(wiring.impacted.find((item) => item.scenarioId === 'tickets.create.positive').changeClass, 'fixture_or_setup_breakage');

  const removed = structuredClone(original.discovery);
  const dto = removed.dto.find((item) => item.function === 'createTicket');
  dto.keys = dto.keys.filter((key) => key.name !== 'priority');
  const loss = plan(removed);
  const priority = loss.impacted.find((item) => item.scenarioId === 'tickets.create.positive');
  assert.equal(priority.changeClass, 'genuine_regression');
  assert.equal(loss.assertionPatches.find((patch) => patch.scenarioId === 'tickets.create.positive').acceptBlocked, true);

  const renamed = structuredClone(original.discovery);
  const status = renamed.dto.find((item) => item.function === 'createTicket').keys.find((key) => key.name === 'status');
  status.literal = 'pending';
  const literal = plan(renamed);
  assert.equal(literal.impacted.find((item) => item.scenarioId === 'tickets.create.positive').changeClass, 'genuine_regression');
  assert.match(literal.assertionPatches.find((patch) => patch.scenarioId === 'tickets.create.positive').explanation, /hide a regression/);
});

test('a handler that remains after its route registration disappears is setup breakage', () => {
  const unwired = structuredClone(original.discovery);
  unwired.routes = unwired.routes.filter((route) => route.path !== '/health');
  const report = plan(unwired);
  const health = report.impacted.find((item) => item.scenarioId === 'health.ok.positive');
  assert.equal(health.changeClass, 'fixture_or_setup_breakage');
  assert.match(health.explanation, /healthHandler/);
});
