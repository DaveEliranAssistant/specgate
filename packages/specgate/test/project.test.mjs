// Route inventory across files: Express routers and mount prefixes, CommonJS,
// TypeScript, imported handlers/controllers, middleware chains, route tables.
// Fixtures are reduced, original code modeled on patterns seen in the
// real-service trial (docs/research/real-service-trial.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { commitFixture } from './fixture-git.mjs';
import { analyzeRepository, scanRepository } from '../src/scan.mjs';
import { analyzeProject } from '../src/engine/project.mjs';

function repo(t, files) {
 const root = mkdtempSync(join(tmpdir(), 'specgate-project-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
 commitFixture(root);
 return root;
}
const scan = (root, sources = ['src']) => scanRepository({ root, sources });
const inventory = report => report.routes.map(r => `${r.method} ${r.path}`).sort();
const codes = report => report.gaps.map(g => g.code);

const CJS = {
 'src/app.js': `const express = require('express');
const api = require('./routes');
const app = express();
app.use(express.json());
app.use('/api/', api);
app.get('/', (req, res) => { res.status(200).json({ ok: true }); });
module.exports = app;
`,
 'src/routes/index.js': `const router = require('express').Router();
router.use('/', require('./users'));
router.use('/orders', require('./orders'));
module.exports = router;
`,
 'src/routes/users.js': `var express = require('express'), controller = require('../controllers/users');
var router = express.Router();
router.get('/user', controller.current);
router.post('/users/login', controller.login);
module.exports = router;
`,
 'src/routes/orders.js': `const { Router } = require('express');
const { list, create, cancel } = require('../controllers/orders');
const limit = require('../middleware/limit');
const router = Router();
router.param('order', (req, res, next, id) => { req.orderId = id; next(); });
router.route('/').get(list).post(limit(5), create);
router.delete('/:order', cancel);
module.exports = router;
`,
 'src/controllers/users.js': `exports.current = async (req, res) => { res.send({}); };
exports.login = async (req, res) => { res.send({}); };
`,
 'src/controllers/orders.js': `const list = async (req, res) => res.send([]);
const create = async (req, res) => res.status(201).send({});
const cancel = async (req, res) => res.status(204).send();
module.exports = { list, create, cancel };
`,
 'src/middleware/limit.js': `module.exports = (max) => (req, res, next) => { if (max < 1) return res.status(429).send(); next(); };
`,
};

test('CommonJS routers compose mount prefixes across files', async t => {
 const report = await scan(repo(t, CJS));
 assert.deepEqual(inventory(report), [
  'DELETE /api/orders/:order', 'GET /', 'GET /api/orders', 'GET /api/user', 'POST /api/orders', 'POST /api/users/login',
 ]);
 const create = report.routes.find(r => r.method === 'POST' && r.path === '/api/orders');
 assert.equal(create.file, 'src/routes/orders.js');
 assert.equal(create.handler, 'create');
 assert.equal(create.handlerFile, 'src/controllers/orders.js');
 assert.deepEqual(create.middleware, ['limit(…)']);
 assert.equal(create.auth, 'unknown', 'opaque middleware is never evidence of missing auth');
 assert.equal(report.complete, false, 'async handlers stay outside the contract subset');
 assert(report.gaps.every(g => g.scope === 'contract' || g.scope === 'inventory'));
 assert(!codes(report).includes('unresolved-registration'));
 assert(!codes(report).includes('no-routes'));
});

test('router.param middleware applies only to routes using that parameter', async t => {
 const root = repo(t, CJS);
 const { contracts, scan: report } = await analyzeRepository({ root, sources: ['src'], withContracts: true });
 const cancel = report.routes.find(r => r.path === '/api/orders/:order');
 const list = report.routes.find(r => r.path === '/api/orders' && r.method === 'GET');
 assert.equal(contracts[cancel.id].middleware.length, 1);
 assert.equal(contracts[list.id].middleware.length, 0);
});

const TS = {
 'src/main.ts': `import express from 'express';
import routes from './app/routes';
const app = express();
app.use(express.json());
app.use(routes);
export default app;
`,
 'src/app/routes.ts': `import { Router } from 'express';
import notes from './notes.controller';
const api = Router().use(notes);
export default Router().use('/api', api);
`,
 'src/app/notes.controller.ts': `import { Request, Response, Router } from 'express';
import { find } from './notes.service';
enum Kind { Plain, Rich }
const router = Router();
router.get('/notes/:id', async (req: Request, res: Response) => {
  res.json({ note: await find(req.params.id as string), kind: Kind.Plain });
});
export default router;
`,
 'src/app/notes.service.ts': `export const find = async (id: string): Promise<string> => id;
`,
 'src/app/types.d.ts': `declare const anything: unknown;
`,
};

test('TypeScript sources are scanned (types stripped), .d.ts files are ignored', async t => {
 const report = await scan(repo(t, TS));
 assert.deepEqual(inventory(report), ['GET /api/notes/:id']);
 assert.equal(report.routes[0].file, 'src/app/notes.controller.ts');
 assert(!codes(report).includes('unsupported-language'));
 assert(!codes(report).includes('parse-error'));
 assert(report.routes[0].line > 0);
});

test('TSX and JSX remain explicit unsupported-language gaps', async t => {
 const report = await scan(repo(t, { ...TS, 'src/view.tsx': 'export const v = <div/>;\n' }));
 assert(codes(report).includes('unsupported-language'));
 assert.equal(report.complete, false);
});

test('route tables unrolled with forEach, conditional mounts are flagged', async t => {
 const report = await scan(repo(t, {
  'src/app.js': `const express = require('express');
const config = require('./config');
const app = express();
const table = [{ path: '/a', route: require('./a') }];
const devOnly = [{ path: '/docs', route: require('./a') }];
table.forEach((entry) => { app.use(entry.path, entry.route); });
if (config.dev) { devOnly.forEach((entry) => { app.use(entry.path, entry.route); }); }
module.exports = app;
`,
  'src/a.js': `const router = require('express').Router();
router.get('/x', (req, res) => { res.status(200).json({}); });
module.exports = router;
`,
  'src/config.js': `module.exports = { dev: process.env.DEV === '1' };
`,
 }));
 assert.deepEqual(inventory(report), ['GET /a/x', 'GET /docs/x']);
 assert.equal(report.routes.find(r => r.path === '/docs/x').conditional, true);
 assert.equal(report.routes.find(r => r.path === '/a/x').conditional, undefined);
 assert(codes(report).includes('conditional-registration'));
});

test('routers that are never mounted, escape into helpers or hide behind unknown calls are gaps', async t => {
 const report = await scan(repo(t, {
  'src/app.js': `const express = require('express');
const setup = require('./setup');
const app = express();
const lost = express.Router();
lost.get('/lost', (req, res) => { res.status(200).json({}); });
setup(app);
app.use(makeRouter());
const client = getClient();
client.get('/remote/path', () => {});
module.exports = app;
`,
  'src/setup.js': `module.exports = (app) => { app.get('/hidden', (req, res) => { res.status(200).json({}); }); };
`,
 }));
 assert.deepEqual(inventory(report), [], 'nothing reachable is invented');
 for (const code of ['unmounted-router', 'express-object-escapes', 'unresolved-middleware-or-router', 'unresolved-registration', 'no-routes']) assert(codes(report).includes(code), code);
});

test('without an app in scope, routers are listed with a mount-not-in-scope gap', async t => {
 const report = await scan(repo(t, { 'src/routes.js': CJS['src/routes/users.js'], 'src/controllers/users.js': CJS['src/controllers/users.js'] }));
 assert.deepEqual(inventory(report), ['GET /user', 'POST /users/login']);
 assert(codes(report).includes('router-mount-not-in-scope'));
});

test('Router look-alikes not imported from express are flagged, never trusted', async t => {
 const report = await scan(repo(t, {
  'src/app.js': `const Router = () => ({ get() {} });
const router = Router();
router.get('/x', (req, res) => { res.status(200).json({}); });
module.exports = router;
`,
 }));
 assert(codes(report).includes('unverified-express-binding'));
 assert(report.routes.every(r => r.auth === 'unknown'));
});

test('middleware labels and reports never contain literal arguments', async t => {
 const report = await scan(repo(t, {
  ...CJS,
  'src/routes/orders.js': CJS['src/routes/orders.js'].replace('limit(5)', "limit('SECRET_LIMIT_VALUE')"),
 }));
 assert(!JSON.stringify(report).includes('SECRET_LIMIT_VALUE'));
});

test('evidence is independent of file order and route registration order', () => {
 const files = Object.entries(CJS).map(([path, source]) => ({ path, source }));
 const a = analyzeProject(files);
 const reordered = files.reverse().map(f => f.path === 'src/routes/orders.js'
  ? { ...f, source: f.source.replace("router.route('/').get(list).post(limit(5), create);\nrouter.delete('/:order', cancel);", "router.delete('/:order', cancel);\nrouter.route('/').get(list).post(limit(5), create);") }
  : f);
 const b = analyzeProject(reordered);
 const key = r => `${r.method} ${r.path}`;
 const byKey = list => Object.fromEntries(list.map(r => [key(r), [r.contract.evidence, r.contract.depEvidence, r.contract.trailingEvidence]]));
 assert.deepEqual(byKey(b.routes), byKey(a.routes));
});

test('a handler renamed or moved between files keeps the same evidence', () => {
 const files = Object.entries(CJS).map(([path, source]) => ({ path, source }));
 const moved = files.map(f => f.path === 'src/controllers/orders.js'
  ? { ...f, source: f.source.replaceAll('create', 'createOrder').replace('createOrder, cancel', 'createOrder: createOrder, cancel').replace('module.exports = { list, createOrder: createOrder, cancel };', 'module.exports = { list, create: createOrder, cancel };') }
  : f);
 const a = analyzeProject(files).routes.find(r => r.method === 'POST' && r.path === '/api/orders');
 const b = analyzeProject(moved).routes.find(r => r.method === 'POST' && r.path === '/api/orders');
 assert.equal(b.contract.evidence, a.contract.evidence);
 assert.equal(b.contract.depEvidence, a.contract.depEvidence);
});

test('cyclic definitions and mutually requiring modules degrade to gaps, not crashes', async t => {
 const report = await scan(repo(t, {
  'src/app.js': `const express = require('express');
const a = b;
const b = a;
const app = express();
app.use(require('./loop-a'));
app.use(a);
app.get('/ok', (req, res) => { res.status(200).json({}); });
module.exports = app;
`,
  'src/loop-a.js': `module.exports = require('./loop-b');\n`,
  'src/loop-b.js': `module.exports = require('./loop-a');\n`,
 }));
 assert.deepEqual(inventory(report), ['GET /ok']);
 assert(codes(report).includes('unresolved-middleware-or-router'));
});
