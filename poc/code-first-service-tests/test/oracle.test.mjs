import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTextEdits } from '../src/edits.mjs';
import { generateSpec, specBlock } from '../src/generate.mjs';
import { loadFixtureFiles } from '../src/load.mjs';
import { applyReviewedChanges, planMaintenance } from '../src/maintain.mjs';
import { artifactsFrom, editedArtifacts, originalArtifacts } from './helpers.mjs';

const original = originalArtifacts();

test('every approved baseline case becomes one executable scenario and one generated test', () => {
  assert.equal(original.scenarioDoc.scenarios.length, 21);
  assert.equal(original.scenarioDoc.scenarios.every((scenario) => scenario.executable && scenario.version === 1), true);
  const kinds = Object.groupBy(original.scenarioDoc.scenarios, (scenario) => scenario.kind);
  assert.equal(kinds.positive.length, 5);
  assert.equal(kinds.invalid_input.length, 5);
  assert.equal(kinds.boundary.length, 6);
  assert.equal(kinds.unauthorized.length, 3);
  assert.equal(kinds.not_found.length, 2);
  assert.equal(original.scenarioDoc.scenarios.filter((scenario) => scenario.classification === 'accepted_regression_behavior').map((scenario) => scenario.id).join(), 'tickets.create.accepted-empty-body');
  for (const scenario of original.scenarioDoc.scenarios) {
    assert.equal(original.spec.includes(`test(${JSON.stringify(scenario.id)}`), true);
    assert.equal(specBlock(original.spec, scenario.id).includes(scenario.id), true);
  }
  assert.equal(original.spec.includes('resetStore()'), true);
  assert.match(original.spec, /127\\.0\\.0\\.1/);
  assert.equal(original.spec.includes('example.com'), false);
  assert.equal(original.spec.includes('https://'), false);
});

test('changing implementation observations does not change assertions or generated tests', () => {
  const files = loadFixtureFiles();
  const variants = [
    [{ file: 'fixture/ticket-desk/service.mjs', find: 'res.status(201).json(ticket);', replace: 'res.status(200).json(ticket);', expectCount: 1 }],
    [{ file: 'fixture/ticket-desk/service.mjs', find: "error: 'title_type'", replace: "error: 'title_changed'", expectCount: 1 }],
    [{ file: 'fixture/ticket-desk/service.mjs', find: "BEARER_TOKEN = 'synthetic-token'", replace: "BEARER_TOKEN = 'HACKED'", expectCount: 1 }],
    [{ file: 'fixture/ticket-desk/store.mjs', find: "let storedBody = '';", replace: "let storedBody = '(none)';", expectCount: 1 }],
  ];
  for (const edits of variants) {
    const mutated = artifactsFrom(applyTextEdits(files, edits));
    assert.deepEqual(mutated.scenarioDoc.scenarios, original.scenarioDoc.scenarios);
    assert.equal(mutated.spec, original.spec);
  }
  const create = specBlock(original.spec, 'tickets.create.positive');
  assert.equal(create.includes('toBe(201)'), true);
  assert.equal(create.includes('toBe(200)'), false);
  assert.equal(original.spec.includes('synthetic-token'), true);
  assert.equal(original.spec.includes('HACKED'), false);
  assert.equal(JSON.stringify(original.scenarioDoc.scenarios).includes('(none)'), false);
  const accepted = original.scenarioDoc.scenarios.find((scenario) => scenario.id === 'tickets.create.accepted-empty-body');
  assert.equal(accepted.assertions.find((assertion) => assertion.bodyMatch).bodyMatch.body, '');
});

test('baseline strings cannot break out of the generated test', () => {
  const malicious = structuredClone(original.scenarioDoc);
  const payload = '"); throw new Error("pwned"); //';
  malicious.scenarios[1].actions[0].body.title = payload;
  const attacked = generateSpec(malicious, { harnessSpecifier: '../fixture/ticket-desk/runtime.mjs' });
  assert.equal(attacked.includes(payload), false);
  assert.equal(attacked.includes('throw new Error("pwned")'), false);
  assert.equal(attacked.includes(JSON.stringify(payload)), true);
  assert.doesNotThrow(() => new Function(attacked.replace(/^import .*$/gm, '')));
});

test('an unchanged discovery does not propose assertion edits', () => {
  const plan = planMaintenance({
    previousDiscovery: original.discovery,
    nextDiscovery: original.discovery,
    scenarioDoc: original.scenarioDoc,
  });
  assert.deepEqual(plan.impacted, []);
  assert.deepEqual(plan.assertionPatches, []);
  assert.deepEqual(plan.proposals, []);
  assert.equal(plan.unaffectedScenarioIds.length, 21);
});

test('the sample service, DTO, and route diff keeps scenario ids and tests unchanged', () => {
  const sample = editedArtifacts('maintenance/sample-edits.json');
  const before = JSON.stringify(original.scenarioDoc);
  const plan = planMaintenance({
    previousDiscovery: original.discovery,
    nextDiscovery: sample.built.discovery,
    scenarioDoc: original.scenarioDoc,
  });
  assert.equal(JSON.stringify(original.scenarioDoc), before);
  assert.deepEqual(sample.built.scenarioDoc.scenarios, original.scenarioDoc.scenarios);
  assert.equal(sample.built.spec, original.spec);
  assert.deepEqual(plan.impacted.map((item) => item.scenarioId), ['tickets.create.boundary-title-max']);
  assert.equal(plan.impacted[0].changeClass, 'genuine_regression');
  assert.equal(plan.impacted[0].predictedResult, 'fail');
  assert.equal(plan.impacted[0].assertionsChanged, false);
  assert.equal(plan.impacted[0].recommendedAction, 'fix_service');
  assert.equal(plan.unaffectedScenarioIds.includes('tickets.create.boundary-title-max'), false);
  assert.equal(plan.unaffectedScenarioIds.includes('tickets.create.boundary-title-over-max'), true);
  assert.equal(plan.unaffectedScenarioIds.includes('health.ok.positive'), true);
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].classification, 'unverified_proposal');
  assert.equal(plan.proposals[0].method, 'GET');
  assert.equal(plan.proposals[0].path, '/audit');
  assert.equal(plan.proposals[0].needsReview, true);
  assert.equal(plan.proposals[0].applied, false);
  assert.equal(plan.assertionPatches.length, 1);
  const patch = plan.assertionPatches[0];
  assert.equal(patch.needsReview, true);
  assert.equal(patch.applied, false);
  assert.equal(patch.acceptBlocked, true);
  assert.equal(patch.changeClass, 'genuine_regression');
  assert.match(patch.explanation, /hide a regression/);
  assert.equal(patch.temptedChanges[0].fromLength, 80);
  assert.equal(patch.temptedChanges[0].toLength, 40);
  assert.equal(plan.observations.some((item) => item.explanation.includes('assignee')), true);
  assert.equal(plan.observations.some((item) => item.scenarioId === 'tickets.create.boundary-title-over-max'), true);
  assert.throws(() => applyReviewedChanges(original.scenarioDoc, plan, { acceptIds: ['tickets.create.boundary-title-max'] }), /blocked/);
});

test('an approved maximum is patched only when a review matches discovery and is explicitly accepted', () => {
  const sample = editedArtifacts('maintenance/sample-edits.json');
  const review = {
    scenarioId: 'tickets.create.boundary-title-max',
    decision: 'approve_behavior_change',
    reason: 'Product owner reduced the title maximum to 40 characters.',
    boundary: { field: 'title', length: 40, relation: 'max_inclusive' },
  };
  const mismatch = planMaintenance({
    previousDiscovery: original.discovery,
    nextDiscovery: sample.built.discovery,
    scenarioDoc: original.scenarioDoc,
    reviews: [{ ...review, boundary: { ...review.boundary, length: 30 } }],
  });
  assert.equal(mismatch.impacted[0].changeClass, 'genuine_regression');
  assert.equal(mismatch.assertionPatches[0].acceptBlocked, true);
  assert.equal(mismatch.rejectedReviews[0].reason.includes('does not match'), true);

  const approved = planMaintenance({
    previousDiscovery: original.discovery,
    nextDiscovery: sample.built.discovery,
    scenarioDoc: original.scenarioDoc,
    reviews: [review],
  });
  const patch = approved.assertionPatches[0];
  assert.equal(patch.changeClass, 'approved_behavior_change');
  assert.equal(patch.needsReview, true);
  assert.equal(patch.applied, false);
  assert.equal(patch.acceptBlocked, false);
  assert.equal(patch.edits.boundaryLength, 40);
  const untouched = applyReviewedChanges(original.scenarioDoc, approved, { acceptIds: [] });
  assert.deepEqual(untouched.scenarios, original.scenarioDoc.scenarios);
  const applied = applyReviewedChanges(original.scenarioDoc, approved, { acceptIds: ['tickets.create.boundary-title-max'] });
  assert.equal(JSON.stringify(original.scenarioDoc), JSON.stringify(artifactsFrom(loadFixtureFiles()).scenarioDoc));
  const changed = applied.scenarios.find((scenario) => scenario.id === 'tickets.create.boundary-title-max');
  assert.equal(changed.version, 2);
  assert.equal(changed.boundary.length, 40);
  assert.equal(changed.actions[0].body.title.length, 40);
  assert.equal(changed.assertions.find((assertion) => assertion.bodyMatch).bodyMatch.title.length, 40);
  assert.equal(changed.review.accepted, true);
  assert.equal(patch.applied, false);
  for (const scenario of applied.scenarios.filter((item) => item.id !== changed.id)) {
    assert.deepEqual(scenario, original.scenarioDoc.scenarios.find((item) => item.id === scenario.id));
  }
});
