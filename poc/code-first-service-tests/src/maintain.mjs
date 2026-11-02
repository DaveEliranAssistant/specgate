import { findRoute } from './routes.mjs';

const CLASS_RANK = {
  flakiness: 1,
  approved_behavior_change: 2,
  genuine_regression: 3,
  fixture_or_setup_breakage: 4,
};

export function planMaintenance({ previousDiscovery, nextDiscovery, scenarioDoc, reviews = [], runs = [] }) {
  const scenarioSnapshot = JSON.stringify(scenarioDoc);
  const impacts = new Map();
  const patches = new Map();
  const observations = [];
  const proposals = [];
  const rejectedReviews = [];
  const usedReviews = new Set();
  const scenarios = scenarioDoc.scenarios;

  const parseErrors = nextDiscovery.files.filter((file) => file.parseError);
  if (parseErrors.length) {
    for (const scenario of scenarios) {
      addImpact(impacts, {
        scenarioId: scenario.id,
        changeClass: 'fixture_or_setup_breakage',
        predictedResult: 'not_run',
        recommendedAction: 'repair_fixture',
        needsReview: false,
        explanation: `Discovery parse error in ${parseErrors.map((file) => file.path).join(', ')}.`,
      });
    }
  } else {
    analyzeStatic({ previousDiscovery, nextDiscovery, scenarioDoc, scenarios, reviews, impacts, patches, observations, proposals, rejectedReviews, usedReviews });
  }

  for (const group of groupRuns(runs)) {
    mergeRuntime(impacts, patches, classifyRuns(group));
  }
  for (const review of reviews) {
    if (!usedReviews.has(review.scenarioId)) {
      rejectedReviews.push({ scenarioId: review.scenarioId, reason: 'Review did not match a discovered disagreement.' });
    }
  }

  const impacted = [...impacts.values()].map((entry) => ({
    scenarioId: entry.scenarioId,
    changeClass: entry.changeClass,
    predictedResult: entry.predictedResult,
    assertionsChanged: false,
    needsReview: entry.changeClass === 'approved_behavior_change',
    recommendedAction: entry.recommendedAction,
    explanation: entry.explanation,
    runtimeAgrees: entry.runtimeAgrees ?? null,
  }));
  const impactedIds = new Set(impacted.map((entry) => entry.scenarioId));
  const report = {
    schemaVersion: '1.0.0',
    synthetic: true,
    unaffectedScenarioIds: scenarios.filter((scenario) => !impactedIds.has(scenario.id)).map((scenario) => scenario.id),
    impacted,
    assertionPatches: [...patches.values()],
    proposals,
    observations,
    rejectedReviews,
  };
  if (JSON.stringify(scenarioDoc) !== scenarioSnapshot) throw new Error('planMaintenance mutated the scenario document');
  if (report.assertionPatches.some((patch) => patch.needsReview !== true || patch.applied !== false)) {
    throw new Error('Assertion patch was not held for review');
  }
  return report;
}

export function applyReviewedChanges(scenarioDoc, plan, options = {}) {
  const acceptIds = [...(options.acceptIds ?? [])];
  const planSnapshot = JSON.stringify(plan);
  const docSnapshot = JSON.stringify(scenarioDoc);
  for (const id of acceptIds) {
    const patch = plan.assertionPatches.find((item) => item.scenarioId === id);
    if (!patch) throw new Error(`No assertion patch for ${id}`);
    if (patch.acceptBlocked) throw new Error(`Assertion patch for ${id} is blocked`);
    if (patch.changeClass !== 'approved_behavior_change') throw new Error(`Only an approved behavior change can be applied for ${id}`);
    if (patch.needsReview !== true || patch.applied !== false || !patch.edits) throw new Error(`Patch for ${id} is not a pending review`);
  }
  const next = structuredClone(scenarioDoc);
  if (acceptIds.length === 0) {
    assertUntouched(plan, planSnapshot, scenarioDoc, docSnapshot);
    return next;
  }
  for (const id of acceptIds) {
    const scenario = next.scenarios.find((item) => item.id === id);
    const patch = plan.assertionPatches.find((item) => item.scenarioId === id);
    scenario.boundary.length = patch.edits.boundaryLength;
    scenario.boundary.approvedMax = patch.edits.approvedMax;
    for (const edit of patch.edits.actionBodies) {
      scenario.actions.find((action) => action.id === edit.actionId).body[edit.field] = edit.value;
    }
    for (const edit of patch.edits.bodyMatches) {
      const assertion = scenario.assertions.find((item) => item.action === edit.action && item.bodyMatch && Object.hasOwn(item.bodyMatch, edit.field));
      assertion.bodyMatch[edit.field] = edit.value;
    }
    scenario.version += 1;
    scenario.review = { accepted: true, reason: patch.explanation, needsReview: false };
  }
  assertUntouched(plan, planSnapshot, scenarioDoc, docSnapshot);
  return next;
}

export function classifyRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error('runs are required');
  const scenarioId = runs[0].scenarioId;
  if (runs.some((run) => run.scenarioId !== scenarioId)) throw new Error('classifyRuns received mixed scenario ids');
  const passed = runs.filter((run) => run.result === 'passed').length;
  const failed = runs.filter((run) => run.result === 'failed').length;
  const timedOut = runs.filter((run) => run.result === 'timedOut').length;
  if (passed && (failed || timedOut)) {
    return result(scenarioId, 'flakiness', 'rerun', 'The scenario both passed and failed. Do not edit assertions.');
  }
  if (timedOut && !failed && !passed) {
    return result(scenarioId, 'flakiness', 'rerun', 'A timeout without an assertion mismatch is not a confirmed behavior change.');
  }
  if (failed && !passed) {
    const text = runs.map((run) => `${run.error ?? ''}\n${run.errorCode ?? ''}`).join('\n');
    if (/ECONNREFUSED|ENOTFOUND|EADDRINUSE|ECONNRESET|Cannot find module|SyntaxError/.test(text)) {
      return result(scenarioId, 'fixture_or_setup_breakage', 'repair_fixture', 'The failure is a connection, module, or syntax error.');
    }
    if (/Expected|Received|toBe|toEqual|toMatchObject/.test(text)) {
      return result(scenarioId, 'genuine_regression', 'fix_service', 'The failure is an assertion mismatch against the approved baseline.');
    }
    return result(scenarioId, 'fixture_or_setup_breakage', 'repair_fixture', 'The failure is not an assertion mismatch. Inspect the harness before editing expectations.');
  }
  return { scenarioId, changeClass: null, recommendedAction: 'none', explanation: 'All supplied runs passed.' };
}

function analyzeStatic(ctx) {
  const previousRoutes = routeMap(ctx.previousDiscovery);
  const nextRoutes = routeMap(ctx.nextDiscovery);
  for (const [key, route] of nextRoutes) {
    if (previousRoutes.has(key)) continue;
    const covered = ctx.scenarios.some((scenario) => scenario.actions.some((action) => routeKey(action) === key));
    if (covered) continue;
    ctx.proposals.push({
      classification: 'unverified_proposal',
      method: route.method,
      path: route.path,
      needsReview: true,
      applied: false,
      explanation: 'Route is present in source and has no baseline scenario. No executable test was added.',
      evidence: route.registration,
    });
  }
  compareDto(ctx);
  compareDependencies(ctx, previousRoutes, nextRoutes);
  compareJsonParser(ctx);
  compareResetHook(ctx);
  compareCredential(ctx, nextRoutes);
  for (const scenario of ctx.scenarios) {
    analyzeScenario(scenario, ctx, previousRoutes, nextRoutes);
  }
}

function analyzeScenario(scenario, ctx, previousRoutes, nextRoutes) {
  for (const action of scenario.actions) {
    const key = `${action.method} ${action.path}`;
    const nextRoute = findRoute(nextRoutes.values(), action.method, action.path);
    const previousRoute = findRoute(previousRoutes.values(), action.method, action.path);
    if (!nextRoute) {
      const handlerName = previousRoute?.handler ?? null;
      const handlerRemains = handlerName && ctx.nextDiscovery.functions.some((fn) => fn.name === handlerName);
      const moved = handlerName ? [...nextRoutes.values()].find((route) => route.handler === handlerName) : null;
      addImpact(ctx.impacts, {
        scenarioId: scenario.id,
        changeClass: handlerRemains ? 'fixture_or_setup_breakage' : 'genuine_regression',
        predictedResult: 'fail',
        recommendedAction: handlerRemains ? 'repair_fixture' : 'fix_service',
        needsReview: false,
        explanation: moved
          ? `${key} is no longer registered. Handler ${handlerName} is now at ${moved.method} ${moved.path}. The scenario path was not rewritten.`
          : handlerRemains
            ? `${key} is no longer registered, but ${handlerName} is still defined.`
            : `${key} is not discovered.`,
      });
      continue;
    }
    compareTerminal(scenario, action, nextRoute, ctx);
    compareErrorCodes(scenario, action, nextRoute, ctx);
  }
  compareBoundary(scenario, nextRoutes, ctx);
  compareConstraint(scenario, nextRoutes, ctx);
}

function compareTerminal(scenario, action, route, ctx) {
  const successes = scenario.assertions.filter((assertion) => assertion.action === action.id && Number.isInteger(assertion.status) && assertion.status < 400);
  if (route.terminalResponses.length !== 1) return;
  const observed = route.terminalResponses[0].status;
  for (const assertion of successes) {
    if (assertion.status === observed) continue;
    addImpact(ctx.impacts, {
      scenarioId: scenario.id,
      changeClass: 'genuine_regression',
      predictedResult: 'fail',
      recommendedAction: 'fix_service',
      needsReview: true,
      explanation: `Observed terminal status for ${action.method} ${action.path} is ${observed}. The approved status remains ${assertion.status}.`,
    });
    addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', 'Adopting the observed status would copy the implementation into the expectation.', [{
      action: action.id,
      fromStatus: assertion.status,
      toStatus: observed,
      source: 'discovered_terminal_status',
    }]));
  }
}

function compareErrorCodes(scenario, action, route, ctx) {
  for (const assertion of scenario.assertions) {
    if (assertion.action !== action.id || !assertion.bodyEquals?.error) continue;
    const field = scenario.constraint?.field ?? scenario.boundary?.field ?? null;
    let related = [];
    if (field) related = route.validation.filter((entry) => entry.field === field && entry.observedRejection);
    else if (scenario.kind === 'unauthorized') related = route.validation.filter((entry) => entry.kind === 'auth_header');
    else if (scenario.kind === 'not_found') related = route.validation.filter((entry) => entry.kind === 'falsy');
    if (related.length === 0) continue;
    if (related.some((entry) => entry.observedRejection.body?.error === assertion.bodyEquals.error)) continue;
    const observed = related[0].observedRejection.body?.error;
    addImpact(ctx.impacts, {
      scenarioId: scenario.id,
      changeClass: 'genuine_regression',
      predictedResult: 'fail',
      recommendedAction: 'fix_service',
      needsReview: true,
      explanation: `Observed error ${observed} does not match approved error ${assertion.bodyEquals.error}.`,
    });
    addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', 'Copying the observed error code would hide a regression.', [{
      fromError: assertion.bodyEquals.error,
      toError: observed,
      source: 'discovered_error',
    }]));
  }
}

function compareBoundary(scenario, routes, ctx) {
  const boundary = scenario.boundary;
  if (!boundary) return;
  const located = locateField(scenario, boundary.field, routes);
  if (!located?.route) return;
  const limits = fieldLimits(located.route, boundary.field);
  const usesMax = boundary.relation === 'max_inclusive' || boundary.relation === 'above_max';
  const discovered = usesMax ? limits.maxLength : limits.minLength;
  if (boundary.relation === 'max_inclusive' && boundary.expect === 'success') {
    if (discovered == null || boundary.length > discovered) {
      const review = matchingReview(scenario, discovered, ctx);
      const edits = review ? repeatEdit(scenario, review.boundary.length) : null;
      if (review && !edits) {
        ctx.rejectedReviews.push({ scenarioId: scenario.id, reason: 'The approved length could not be turned into a fixture string without guessing.' });
      }
      if (review && edits) {
        approveBoundary(scenario, review, edits, discovered, ctx);
      } else {
        regressBoundary(scenario, boundary, discovered, ctx);
      }
    } else if (boundary.length < discovered) {
      ctx.observations.push(observation(scenario.id, `Approved inclusive maximum sample ${boundary.length} is below discovered max ${discovered}. Assertions were not changed.`));
    }
    return;
  }
  if (boundary.relation === 'above_max' && boundary.expect === 'rejection') {
    if (discovered == null || boundary.length <= discovered) {
      regressBoundary(scenario, boundary, discovered, ctx);
    } else if (boundary.approvedMax !== discovered) {
      ctx.observations.push(observation(scenario.id, `Length ${boundary.length} is still above discovered max ${discovered}, so the approved rejection can still pass. It is no longer the tight bound of ${boundary.approvedMax}. Assertions were not changed.`));
    }
    return;
  }
  if (boundary.relation === 'min_inclusive' && boundary.expect === 'success') {
    if (discovered == null || boundary.length < discovered) regressBoundary(scenario, boundary, discovered, ctx);
    else if (boundary.length > discovered) ctx.observations.push(observation(scenario.id, `Approved minimum sample ${boundary.length} is above discovered min ${discovered}. Assertions were not changed.`));
    return;
  }
  if (boundary.relation === 'below_min' && boundary.expect === 'rejection') {
    if (discovered == null || boundary.length >= discovered) regressBoundary(scenario, boundary, discovered, ctx);
    else if (boundary.approvedMin !== discovered) ctx.observations.push(observation(scenario.id, `Length ${boundary.length} is still below discovered min ${discovered}. Assertions were not changed.`));
    return;
  }
  throw new Error(`Unsupported boundary relation ${boundary.relation}`);
}

function compareConstraint(scenario, routes, ctx) {
  const constraint = scenario.constraint;
  if (!constraint) return;
  const located = locateField(scenario, constraint.field, routes);
  if (!located?.route) return;
  const limits = fieldLimits(located.route, constraint.field);
  if (constraint.kind === 'enum') {
    const previousRoute = findRoute(ctx.previousDiscovery.routes, located.action.method, located.action.path);
    const previous = fieldLimits(previousRoute, constraint.field).values;
    if (!limits.values) {
      addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `Enum constraint for ${constraint.field} is no longer discovered.`));
    } else if (constraint.value != null && limits.values.includes(constraint.value)) {
      addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `${constraint.value} is now an allowed ${constraint.field}.`));
      addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', 'Removing the rejection would hide a regression.', [{ field: constraint.field, value: constraint.value, source: 'discovered_enum' }]));
    } else if (previous && JSON.stringify(previous) !== JSON.stringify(limits.values)) {
      ctx.observations.push(observation(scenario.id, `Allowed ${constraint.field} values changed, and this rejection still holds. Assertions were not changed.`));
    }
    return;
  }
  if (constraint.kind === 'type' && (!limits.present || limits.expectedType !== constraint.expectedType)) {
    addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `Type constraint for ${constraint.field} no longer matches ${constraint.expectedType}.`));
  }
}

function compareDto(ctx) {
  const previous = dtoIndex(ctx.previousDiscovery);
  const next = dtoIndex(ctx.nextDiscovery);
  for (const [key, value] of next) {
    if (previous.has(key)) continue;
    ctx.observations.push({
      classification: 'implementation_observation',
      scenarioId: null,
      executable: false,
      explanation: `DTO ${value.function}.${value.local} gained ${value.name}. Existing assertions use subset match and were not changed.`,
      evidence: { file: value.file, line: value.line, symbol: value.function },
    });
  }
  for (const [key, value] of previous) {
    if (next.has(key)) continue;
    for (const scenario of scenariosAsserting(ctx.scenarios, value.name)) {
      addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `DTO field ${value.name} was removed from ${value.function}.`));
      addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', `Dropping ${value.name} from the assertion would hide a removed field.`, [{ field: value.name, source: 'dto_key_removed' }]));
    }
  }
  for (const [key, value] of next) {
    const prior = previous.get(key);
    if (!prior || prior.kind !== 'literal' || value.kind !== 'literal' || Object.is(prior.literal, value.literal)) continue;
    for (const scenario of ctx.scenarios) {
      const matches = bodyFields(scenario).filter((field) => field.key === value.name && Object.is(field.value, prior.literal));
      if (matches.length === 0) continue;
      addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `Observed literal ${value.name} changed from ${JSON.stringify(prior.literal)} to ${JSON.stringify(value.literal)}.`));
      addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', 'Copying the new literal into the assertion would hide a regression.', [{
        field: value.name,
        from: prior.literal,
        to: value.literal,
        source: 'dto_literal',
      }]));
    }
  }
}

function compareDependencies(ctx, previousRoutes, nextRoutes) {
  for (const [key, previous] of previousRoutes) {
    const next = nextRoutes.get(key);
    if (!next) continue;
    if (dependencySignature(previous) === dependencySignature(next)) continue;
    for (const scenario of ctx.scenarios.filter((item) => item.actions.some((action) => routeKey(action) === key))) {
      addImpact(ctx.impacts, impact(scenario.id, 'fixture_or_setup_breakage', 'unknown', 'repair_fixture', `Dependency boundary for ${key} changed. Assertions were not edited.`));
    }
  }
}

function compareJsonParser(ctx) {
  const had = ctx.previousDiscovery.setups.some((setup) => setup.kind === 'json-parser');
  const has = ctx.nextDiscovery.setups.some((setup) => setup.kind === 'json-parser');
  if (!had || has) return;
  for (const scenario of ctx.scenarios.filter((item) => item.actions.some((action) => action.body !== undefined))) {
    addImpact(ctx.impacts, impact(scenario.id, 'fixture_or_setup_breakage', 'fail', 'repair_fixture', 'express.json() is no longer registered, so JSON bodies cannot be read.'));
  }
}

function compareResetHook(ctx) {
  const had = ctx.previousDiscovery.exports.some((item) => item.name === 'resetStore');
  const has = ctx.nextDiscovery.exports.some((item) => item.name === 'resetStore');
  if (!had || has) return;
  for (const scenario of ctx.scenarios.filter((item) => item.cleanup.some((step) => step.action === 'reset-store'))) {
    addImpact(ctx.impacts, impact(scenario.id, 'fixture_or_setup_breakage', 'unknown', 'repair_fixture', 'resetStore is no longer exported. Isolation cleanup is broken.'));
  }
}

function compareCredential(ctx, nextRoutes) {
  const name = ctx.scenarioDoc.auth.implementationConstant;
  const previous = ctx.previousDiscovery.constants.find((item) => item.name === name);
  const next = ctx.nextDiscovery.constants.find((item) => item.name === name);
  if (previous && !next) {
    for (const scenario of ctx.scenarios.filter(usesApprovedCredential)) {
      addImpact(ctx.impacts, impact(scenario.id, 'fixture_or_setup_breakage', 'fail', 'repair_fixture', `${name} is no longer defined.`));
    }
    return;
  }
  if (!next || next.literal === ctx.scenarioDoc.auth.syntheticCredential) return;
  for (const scenario of ctx.scenarios.filter(usesApprovedCredential)) {
    const credentialAction = scenario.actions.find((action) => action.auth === true);
    const route = findRoute(nextRoutes.values(), credentialAction.method, credentialAction.path);
    if (route && route.auth === false) continue;
    addImpact(ctx.impacts, impact(scenario.id, 'genuine_regression', 'fail', 'fix_service', `${name} no longer matches the approved synthetic credential.`));
    addPatch(ctx.patches, blockedPatch(scenario.id, 'genuine_regression', 'Copying the implementation credential into the test would make the test follow the code.', [{
      from: ctx.scenarioDoc.auth.syntheticCredential,
      to: next.literal,
      source: 'discovered_constant',
    }]));
  }
}

function matchingReview(scenario, discovered, ctx) {
  const review = ctx.reviews.find((item) => item.scenarioId === scenario.id);
  if (!review) return null;
  ctx.usedReviews.add(scenario.id);
  if (review.decision !== 'approve_behavior_change' || typeof review.reason !== 'string' || review.reason.trim() === '') {
    ctx.rejectedReviews.push({ scenarioId: scenario.id, reason: 'Review is missing an approval decision or reason.' });
    return null;
  }
  if (scenario.boundary?.relation !== 'max_inclusive') {
    ctx.rejectedReviews.push({ scenarioId: scenario.id, reason: 'This proof only constructs an assertion patch for an approved inclusive maximum.' });
    return null;
  }
  if (review.boundary?.field !== scenario.boundary.field || review.boundary.relation !== 'max_inclusive' || review.boundary.length !== discovered) {
    ctx.rejectedReviews.push({ scenarioId: scenario.id, reason: 'Review length does not match the discovered source. It was not treated as approval.' });
    return null;
  }
  return review;
}

function approveBoundary(scenario, review, edits, discovered, ctx) {
  addImpact(ctx.impacts, {
    scenarioId: scenario.id,
    changeClass: 'approved_behavior_change',
    predictedResult: 'fail',
    recommendedAction: 'review_assertion_patch',
    needsReview: true,
    explanation: review.reason,
  });
  addPatch(ctx.patches, {
    scenarioId: scenario.id,
    changeClass: 'approved_behavior_change',
    needsReview: true,
    applied: false,
    acceptBlocked: false,
    explanation: `${review.reason} Discovered maximum is ${discovered}. The assertion patch is proposed and is not applied.`,
    temptedChanges: [{ fromLength: scenario.boundary.length, toLength: review.boundary.length, source: 'review' }],
    edits,
  });
}

function regressBoundary(scenario, boundary, discovered, ctx) {
  addImpact(ctx.impacts, impact(
    scenario.id,
    'genuine_regression',
    'fail',
    'fix_service',
    `Boundary ${boundary.field} ${boundary.relation} length ${boundary.length} disagrees with discovered limit ${discovered}.`,
  ));
  addPatch(ctx.patches, blockedPatch(
    scenario.id,
    'genuine_regression',
    `Discovered limit for ${boundary.field} is ${discovered}. Baseline still requires ${boundary.length}. Copying the discovered bound into the assertion would hide a regression.`,
    [{ fromLength: boundary.length, toLength: discovered, source: 'discovered_bound' }],
  ));
}

function repeatEdit(scenario, nextLength) {
  const field = scenario.boundary.field;
  const action = scenario.actions.find((candidate) => typeof candidate.body?.[field] === 'string');
  const current = action?.body?.[field];
  if (!action || !repeatedChar(current) || current.length !== scenario.boundary.length) return null;
  const value = repeatedChar(current).repeat(nextLength);
  return {
    boundaryLength: nextLength,
    approvedMax: nextLength,
    actionBodies: [{ actionId: action.id, field, value }],
    bodyMatches: scenario.assertions
      .filter((assertion) => assertion.bodyMatch && assertion.bodyMatch[field] === current)
      .map((assertion) => ({ action: assertion.action, field, value })),
  };
}

function repeatedChar(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const char = Array.from(value)[0];
  return value === char.repeat(value.length) ? char : null;
}

function mergeRuntime(impacts, patches, classified) {
  if (!classified.changeClass) {
    const existing = impacts.get(classified.scenarioId);
    if (existing?.predictedResult === 'fail') existing.runtimeAgrees = false;
    return;
  }
  if (classified.changeClass === 'flakiness' || classified.changeClass === 'fixture_or_setup_breakage') {
    patches.delete(classified.scenarioId);
  }
  const existing = impacts.get(classified.scenarioId);
  if (existing && classified.changeClass === 'flakiness') {
    existing.changeClass = 'flakiness';
    existing.recommendedAction = 'rerun';
    existing.predictedResult = 'unknown';
    existing.runtimeAgrees = false;
    existing.explanations.push(classified.explanation);
    existing.explanation = existing.explanations.join(' ');
    return;
  }
  if (!existing) {
    addImpact(impacts, {
      scenarioId: classified.scenarioId,
      changeClass: classified.changeClass,
      predictedResult: classified.changeClass === 'flakiness' ? 'unknown' : 'fail',
      recommendedAction: classified.recommendedAction,
      needsReview: false,
      explanation: classified.explanation,
    });
    impacts.get(classified.scenarioId).runtimeOnly = true;
    impacts.get(classified.scenarioId).runtimeAgrees = true;
    return;
  }
  existing.runtimeAgrees = existing.changeClass === classified.changeClass;
  if ((CLASS_RANK[classified.changeClass] ?? 0) > (CLASS_RANK[existing.changeClass] ?? 0)) {
    existing.changeClass = classified.changeClass;
    existing.recommendedAction = classified.recommendedAction;
  }
  existing.explanations.push(classified.explanation);
  existing.explanation = existing.explanations.join(' ');
}

function addImpact(impacts, entry) {
  const current = impacts.get(entry.scenarioId);
  if (!current) {
    impacts.set(entry.scenarioId, { ...entry, assertionsChanged: false, explanations: [entry.explanation], explanation: entry.explanation });
    return;
  }
  current.explanations.push(entry.explanation);
  current.explanation = current.explanations.join(' ');
  if ((CLASS_RANK[entry.changeClass] ?? 0) > (CLASS_RANK[current.changeClass] ?? 0)) {
    current.changeClass = entry.changeClass;
    current.recommendedAction = entry.recommendedAction;
    current.needsReview = entry.needsReview;
  }
  if (entry.predictedResult === 'fail' || current.predictedResult === 'fail') current.predictedResult = 'fail';
  else if (entry.predictedResult === 'unknown' && current.predictedResult === 'pass') current.predictedResult = 'unknown';
}

function addPatch(patches, patch) {
  const current = patches.get(patch.scenarioId);
  if (!current) {
    patches.set(patch.scenarioId, patch);
    return;
  }
  current.temptedChanges.push(...patch.temptedChanges);
  current.acceptBlocked = current.acceptBlocked || patch.acceptBlocked;
  if (current.acceptBlocked) current.edits = null;
  current.explanation = `${current.explanation} ${patch.explanation}`;
}

function blockedPatch(scenarioId, changeClass, explanation, temptedChanges) {
  return {
    scenarioId,
    changeClass,
    needsReview: true,
    applied: false,
    acceptBlocked: true,
    explanation,
    temptedChanges,
    edits: null,
  };
}

function impact(scenarioId, changeClass, predictedResult, recommendedAction, explanation) {
  return { scenarioId, changeClass, predictedResult, recommendedAction, needsReview: changeClass === 'approved_behavior_change', explanation };
}

function observation(scenarioId, explanation) {
  return { classification: 'implementation_observation', scenarioId, executable: false, explanation };
}

function result(scenarioId, changeClass, recommendedAction, explanation) {
  return { scenarioId, changeClass, recommendedAction, explanation, assertionPatch: null };
}

function routeMap(discovery) {
  return new Map(discovery.routes.map((route) => [routeKey(route), route]));
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}

function fieldLimits(route, field) {
  const limits = { minLength: null, maxLength: null, expectedType: null, values: null, present: false };
  if (!route) return limits;
  for (const entry of route.validation) {
    if (entry.field !== field) continue;
    limits.present = true;
    if (entry.minLength != null) limits.minLength = entry.minLength;
    if (entry.maxLength != null) limits.maxLength = entry.maxLength;
    if (entry.expectedType) limits.expectedType = entry.expectedType;
    if (entry.values) limits.values = [...entry.values];
  }
  return limits;
}

function locateField(scenario, field, routes) {
  const action = scenario.actions.find((candidate) => candidate.body && Object.hasOwn(candidate.body, field));
  if (!action) return null;
  return { action, route: findRoute(routes.values(), action.method, action.path) };
}

function dtoIndex(discovery) {
  const map = new Map();
  for (const dto of discovery.dto) {
    for (const key of dto.keys) {
      map.set(`${dto.function}\0${dto.local}\0${key.name}`, { ...key, function: dto.function, local: dto.local, file: dto.file, line: dto.line });
    }
  }
  return map;
}

function bodyFields(scenario) {
  const fields = [];
  for (const assertion of scenario.assertions) {
    if (!assertion.bodyMatch) continue;
    for (const [key, value] of Object.entries(assertion.bodyMatch)) fields.push({ key, value });
  }
  return fields;
}

function scenariosAsserting(scenarios, key) {
  return scenarios.filter((scenario) => bodyFields(scenario).some((field) => field.key === key));
}

function dependencySignature(route) {
  return (route.dependencies ?? []).map((call) => `${call.callee}@${call.module}`).sort().join('|');
}

function usesApprovedCredential(scenario) {
  return scenario.actions.some((action) => action.auth === true)
    && scenario.assertions.some((assertion) => Number.isInteger(assertion.status) && assertion.status < 400);
}

function groupRuns(runs) {
  const groups = new Map();
  for (const run of runs) {
    if (!groups.has(run.scenarioId)) groups.set(run.scenarioId, []);
    groups.get(run.scenarioId).push(run);
  }
  return [...groups.values()];
}

function assertUntouched(plan, planSnapshot, scenarioDoc, docSnapshot) {
  if (JSON.stringify(plan) !== planSnapshot) throw new Error('plan was mutated');
  if (JSON.stringify(scenarioDoc) !== docSnapshot) throw new Error('scenario document was mutated');
}
