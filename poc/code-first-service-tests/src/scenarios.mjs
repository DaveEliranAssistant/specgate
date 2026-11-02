import { REPO_PREFIX, SCHEMA_VERSION, SERVICE_NAME, SUPPORTED_SUBSET } from './constants.mjs';
import { findRoute } from './routes.mjs';
import { assertRelativePath } from './safety.mjs';

const EXECUTABLE = new Set(['approved_requirement', 'accepted_regression_behavior']);
const KINDS = new Set(['positive', 'invalid_input', 'boundary', 'unauthorized', 'not_found']);

export function compileScenarios({ discovery, baseline, baselineSource, baselinePath, sourceCommit, fixtureSha256 }) {
  assertBaseline(baseline);
  if (typeof sourceCommit !== 'string' || sourceCommit.length === 0) throw new Error('sourceCommit is required');
  if (typeof fixtureSha256 !== 'string' || fixtureSha256.length === 0) throw new Error('fixtureSha256 is required');
  const seen = new Set();
  const scenarios = baseline.cases.map((testCase) => {
    if (seen.has(testCase.id)) throw new Error(`Duplicate scenario id ${testCase.id}`);
    seen.add(testCase.id);
    const actions = testCase.actions.map((action) => {
      const next = { ...action, body: expandValue(action.body, new Map()) };
      if (next.body === undefined) delete next.body;
      return next;
    });
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const assertions = expandValue(testCase.assertions, actionsById);
    const evidence = evidenceFor(testCase, actions, discovery, baselineSource, baselinePath, sourceCommit);
    return {
      id: testCase.id,
      version: 1,
      intent: testCase.intent,
      classification: testCase.classification,
      kind: testCase.kind,
      executable: true,
      discoveryGap: evidence.some((entry) => entry.role === 'discovery_gap'),
      preconditions: [...testCase.preconditions],
      fixtures: structuredClone(testCase.fixtures ?? baseline.defaultFixtures),
      boundary: testCase.boundary ? structuredClone(testCase.boundary) : null,
      constraint: testCase.constraint ? structuredClone(testCase.constraint) : null,
      actions,
      extractions: testCase.extractions.map((extraction) => ({ ...extraction })),
      assertions,
      cleanup: testCase.cleanup.map((step) => ({ ...step })),
      evidence,
    };
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    synthetic: true,
    warning: 'SYNTHETIC fixture. Assertions are copied from the reviewed baseline, not from implementation observations.',
    service: SERVICE_NAME,
    supportedSubset: SUPPORTED_SUBSET,
    sourceCommit,
    fixtureSha256,
    auth: {
      header: baseline.auth.header,
      scheme: baseline.auth.scheme,
      syntheticCredential: baseline.auth.syntheticCredential,
      implementationConstant: baseline.auth.implementationConstant,
    },
    scenarios,
    observations: observationsFrom(discovery, sourceCommit),
    unsupported: discovery.unsupported.map((entry) => ({ ...entry })),
  };
}

function assertBaseline(baseline) {
  if (baseline?.synthetic !== true || baseline.service !== SERVICE_NAME) throw new Error('Baseline is not the synthetic ticket desk');
  if (baseline.oracle?.includes('Discovery must not overwrite') !== true) throw new Error('Baseline oracle statement is missing');
  if (!Array.isArray(baseline.cases)) throw new Error('Baseline cases are required');
  for (const testCase of baseline.cases) {
    if (!EXECUTABLE.has(testCase.classification)) throw new Error(`Baseline classification is not executable: ${testCase.classification}`);
    if (!KINDS.has(testCase.kind)) throw new Error(`Unsupported case kind ${testCase.kind}`);
    if (!Array.isArray(testCase.actions) || testCase.actions.length === 0) throw new Error(`Case ${testCase.id} has no actions`);
    for (const action of testCase.actions) assertRelativePath(action.path);
  }
}

function expandValue(value, actionsById) {
  if (Array.isArray(value)) return value.map((item) => expandValue(item, actionsById));
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$repeat') {
    const { char, count } = value.$repeat;
    if (typeof char !== 'string' || Array.from(char).length !== 1) throw new Error('Repeat character must be a single character');
    if (!Number.isInteger(count) || count < 0 || count > 2000) throw new Error('Repeat count is out of range');
    return char.repeat(count);
  }
  if (keys.length === 1 && keys[0] === '$echo') {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(value.$echo);
    if (!match) throw new Error('Echo path must be action.field');
    const action = actionsById.get(match[1]);
    if (!action?.body || !Object.hasOwn(action.body, match[2])) throw new Error(`Echo target ${value.$echo} is missing`);
    return action.body[match[2]];
  }
  if (keys.some((key) => key.startsWith('$'))) throw new Error(`Unknown template ${keys.join(',')}`);
  const expanded = {};
  for (const key of keys) expanded[key] = expandValue(value[key], actionsById);
  return expanded;
}

function evidenceFor(testCase, actions, discovery, baselineSource, baselinePath, sourceCommit) {
  const evidence = [{
    role: 'requirement',
    file: `${REPO_PREFIX}${baselinePath}`,
    symbol: testCase.id,
    line: lineOfId(baselineSource, testCase.id),
    commit: sourceCommit,
  }];
  for (const action of actions) {
    const route = findRoute(discovery.routes, action.method, action.path);
    if (!route) {
      evidence.push({
        role: 'discovery_gap',
        file: null,
        symbol: `${action.method} ${action.path}`,
        line: null,
        commit: sourceCommit,
      });
      continue;
    }
    evidence.push({ ...prefixed(route.registration), role: 'route_registration', commit: sourceCommit });
    if (route.handlerLocation) evidence.push({ ...prefixed(route.handlerLocation), role: 'handler', commit: sourceCommit });
  }
  return evidence;
}

function observationsFrom(discovery, sourceCommit) {
  return [
    ...discovery.routes.map((route) => ({
      id: `observe.${route.method} ${route.path}`,
      classification: 'implementation_observation',
      executable: false,
      statement: `${route.method} ${route.path} is registered on ${route.handler}. This is not an assertion.`,
      evidence: [route.registration, route.handlerLocation].filter(Boolean).map((entry) => ({ ...prefixed(entry), commit: sourceCommit })),
    })),
    ...discovery.dto.map((dto) => ({
      id: `observe.dto.${dto.function}.${dto.local}`,
      classification: 'implementation_observation',
      executable: false,
      statement: `Object literal ${dto.local} in ${dto.function} has keys ${dto.keys.map((key) => key.name).join(', ')}.`,
      evidence: [{ file: `${REPO_PREFIX}${dto.file}`, symbol: dto.function, line: dto.line, commit: sourceCommit }],
    })),
  ];
}

function prefixed(entry) {
  return { file: `${REPO_PREFIX}${entry.file}`, symbol: entry.symbol, line: entry.line };
}

function lineOfId(source, id) {
  const needle = `"id": "${id}"`;
  const line = source.split('\n').findIndex((text) => text.includes(needle));
  if (line < 0) throw new Error(`Baseline evidence line for ${id} was not found`);
  return line + 1;
}
