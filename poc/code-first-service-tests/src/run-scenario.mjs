import assert from 'node:assert/strict';
import { authHeader, readBodyPath, resolvePath } from './actions.mjs';
import { assertLoopbackBaseUrl } from './safety.mjs';

export async function runScenario(baseURL, scenario, auth) {
  assertLoopbackBaseUrl(baseURL);
  const vars = {};
  for (const action of scenario.actions) {
    const headers = { ...(authHeader(action.auth, auth) ?? {}) };
    if (action.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(baseURL + resolvePath(action.path, vars), {
      method: action.method,
      headers,
      body: action.body === undefined ? undefined : JSON.stringify(action.body),
    });
    const responseBody = await response.json();
    for (const assertion of scenario.assertions.filter((item) => item.action === action.id)) {
      applyAssertion(scenario.id, assertion, response.status, responseBody, vars);
    }
    for (const extraction of scenario.extractions.filter((item) => item.action === action.id)) {
      vars[extraction.name] = readBodyPath(responseBody, extraction.path);
    }
  }
}

function applyAssertion(id, assertion, status, body, vars) {
  if (Object.hasOwn(assertion, 'status')) assert.equal(status, assertion.status, `${id} status`);
  if (assertion.bodyEquals) assert.deepEqual(body, assertion.bodyEquals, `${id} bodyEquals`);
  if (assertion.bodyMatch) {
    for (const [key, value] of Object.entries(assertion.bodyMatch)) assert.deepEqual(body[key], value, `${id} bodyMatch.${key}`);
  }
  if (assertion.bodyField?.type === 'non_empty_string') {
    const value = readBodyPath(body, assertion.bodyField.path);
    assert.equal(typeof value, 'string', `${id} type`);
    assert.ok(value.length > 0, `${id} empty`);
  }
  if (assertion.bodyField?.equalsExtraction) {
    assert.equal(readBodyPath(body, assertion.bodyField.path), vars[assertion.bodyField.equalsExtraction], `${id} extraction`);
  }
}
