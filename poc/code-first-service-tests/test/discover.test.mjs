import assert from 'node:assert/strict';
import test from 'node:test';
import { discover } from '../src/discover.mjs';
import { loadFixtureFiles } from '../src/load.mjs';
import { originalArtifacts } from './helpers.mjs';

const files = loadFixtureFiles();
const discovery = originalArtifacts().discovery;

function source(path) {
  return files.find((file) => file.path === path).source;
}

function lineOf(path, text) {
  const index = source(path).split('\n').findIndex((line) => line.includes(text));
  assert.ok(index >= 0, text);
  return index + 1;
}

test('literal Express routes are discovered with file, symbol, and line evidence', () => {
  const service = 'fixture/ticket-desk/service.mjs';
  assert.deepEqual(discovery.routes.map((route) => [route.method, route.path, route.auth, route.handler]), [
    ['POST', '/tickets', false, 'createTicketHandler'],
    ['GET', '/tickets/:id', true, 'getTicketHandler'],
    ['PATCH', '/tickets/:id', true, 'updateStatusHandler'],
    ['GET', '/health', false, 'healthHandler'],
  ]);
  const create = discovery.routes[0];
  assert.equal(create.registration.line, lineOf(service, "app.post('/tickets'"));
  assert.equal(create.handlerLocation.line, lineOf(service, 'export function createTicketHandler'));
  assert.equal(create.handlerLocation.symbol, 'createTicketHandler');
  assert.equal(create.registration.symbol, 'app.post');
  assert.equal(create.handlerUnsupported, 0);
  assert.deepEqual(create.dependencies.map((call) => [call.callee, call.module, call.argumentsSupported]), [
    ['createTicket', './store.mjs', true],
  ]);
  const title = create.validation.find((entry) => entry.kind === 'length' && entry.field === 'title');
  assert.equal(title.minLength, 1);
  assert.equal(title.maxLength, 80);
  assert.equal(title.line, lineOf(service, 'title.length < 1'));
  assert.deepEqual(create.validation.find((entry) => entry.kind === 'enum').values, ['low', 'normal', 'high']);
  const body = create.validation.find((entry) => entry.field === 'body');
  assert.equal(body.optional, true);
  assert.equal(body.expectedType, 'string');
  assert.equal(body.maxLength, 500);
  assert.equal(create.terminalResponses[0].status, 201);
  assert.equal(create.terminalResponses[0].note.includes('Not an assertion source'), true);
  const read = discovery.routes[1];
  assert.deepEqual(read.middleware, ['requireBearer']);
  assert.equal(read.middlewareLocations[0].line, lineOf(service, 'export function requireBearer'));
  assert.equal(discovery.unsupported.filter((entry) => entry.file === service).length, 0);
});

test('DTO keys and the synthetic credential are observations, and runtime is not scanned', () => {
  const created = discovery.dto.find((dto) => dto.function === 'createTicket');
  assert.equal(created.keys.find((key) => key.name === 'status').literal, 'open');
  assert.equal(discovery.constants.find((item) => item.name === 'BEARER_TOKEN').literal, 'synthetic-token');
  assert.equal(discovery.files.some((file) => file.path.endsWith('runtime.mjs')), false);
  assert.equal(discovery.exports.some((item) => item.name === 'resetStore'), true);
  assert.equal(discovery.setups.some((item) => item.kind === 'json-parser'), true);
});

test('dynamic route patterns are reported and not turned into routes', () => {
  const unsupported = discovery.unsupported.filter((entry) => entry.file.endsWith('unsupported.mjs'));
  const patterns = new Set(unsupported.map((entry) => entry.pattern));
  for (const pattern of ['computed-method', 'template-path', 'call-expression-path', 'concatenated-path', 'inline-handler', 'chained-route', 'nested-registration']) {
    assert.equal(patterns.has(pattern), true, pattern);
  }
  assert.equal(discovery.routes.some((route) => route.file.endsWith('unsupported.mjs')), false);
  assert.equal(discovery.routes.some((route) => route.path.includes('$') || route.path.includes('computed') || route.path === '/inline' || route.path === '/chained'), false);
  assert.equal(unsupported.filter((entry) => entry.pattern === 'unclassified-app-call').length, 0);
  const store = discovery.unsupported.filter((entry) => entry.file.endsWith('store.mjs'));
  assert.equal(store.some((entry) => entry.pattern === 'new-expression'), true);
  assert.equal(store.some((entry) => entry.pattern === 'assignment'), true);
});

test('unsupported syntax is not guessed into a validation rule', () => {
  const parsed = discover([{
    path: 'inline.mjs',
    source: [
      "import express from 'express';",
      'export const app = express();',
      'export function createTicketHandler(req, res) {',
      '  const title = req.body.title;',
      '  if (title.length <= 4) {',
      "    res.status(400).json({ error: 'short' });",
      '    return;',
      '  }',
      '  res.status(201).json({ ok: true });',
      '}',
      "app.post('/tickets', createTicketHandler);",
    ].join('\n'),
  }]);
  const route = parsed.routes[0];
  assert.equal(route.validation.length, 0);
  assert.equal(parsed.unsupported.some((entry) => entry.snippet.includes('title.length <= 4')), true);
});

test('a parse error does not invent routes', () => {
  const parsed = discover([{ path: 'broken.mjs', source: 'export function (' }]);
  assert.equal(parsed.routes.length, 0);
  assert.equal(parsed.files[0].parseError.includes('Unexpected') || parsed.files[0].parseError.length > 0, true);
  assert.equal(parsed.unsupported[0].pattern, 'parse-error');
});
