#!/usr/bin/env node
// Reproduces the real-service trial in docs/research/real-service-trial.md.
//
//   node scripts/real-service-trial.mjs TARGETS_DIR [--mutations] [--json]
//
// TARGETS_DIR must contain clones of:
//   realworld   https://github.com/gothinkster/node-express-realworld-example-app
//   boilerplate https://github.com/hagopj13/node-express-boilerplate
// Runs the local CLI only (no network, no model). Each target is read from Git
// objects at pinned commits; the working trees are never imported or executed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'specgate', 'bin', 'specgate.mjs');

// expected: what a careful human reviewer says about the change (ground truth).
export const PAIRS = [
 { id: 'B1', target: 'boilerplate', sources: ['src'], head: 'c7879be', expected: 'breaking', note: 'POST /v1/auth/refreshTokens renamed to /refresh-tokens' },
 { id: 'B2', target: 'boilerplate', sources: ['src'], head: '750feb5', expected: 'non_breaking+review', note: 'POST /v1/auth/logout added; auth controller/service modules changed' },
 { id: 'B3', target: 'boilerplate', sources: ['src'], head: '9dae3f2', expected: 'non_breaking+review', note: 'two email-verification routes added; roles/token config changed' },
 { id: 'B4', target: 'boilerplate', sources: ['src'], head: '40b6294', expected: 'breaking', note: 'POST /v1/auth/verification-email renamed to /send-verification-email' },
 { id: 'B5', target: 'boilerplate', sources: ['src'], head: '68d1e33', expected: 'needs_review', note: '/v1/docs mount made conditional on config.env' },
 { id: 'B6', target: 'boilerplate', sources: ['src'], head: 'f7a7aab', expected: 'non_breaking+review', note: 'DELETE /v1/users/:userId added' },
 { id: 'B7', target: 'boilerplate', sources: ['src'], head: '3b43f7f', expected: 'non_breaking+review', note: 'POST /v1/auth/reset-password added' },
 { id: 'B8', target: 'boilerplate', sources: ['src'], head: 'cd683e9', expected: 'needs_review', note: 'Joi query key sort renamed to sortBy (consumer-visible, schema in imported module)' },
 { id: 'B9', target: 'boilerplate', sources: ['src'], head: '19cda9c', expected: 'needs_review', note: 'roles config refactor behind auth middleware' },
 { id: 'R1', target: 'realworld', sources: ['app.js', 'routes'], head: 'a74fd52', expected: 'non_breaking', note: 'GET /api/articles and /api/articles/feed added' },
 { id: 'R2', target: 'realworld', sources: ['app.js', 'routes'], head: 'a7bc455', expected: 'needs_review', note: 'PUT/DELETE /api/articles/:article handler logic changed (adds 401)' },
 { id: 'R3', target: 'realworld', sources: ['app.js', 'routes'], head: 'e07c9bb', expected: 'needs_review', note: 'auth middleware edit that is a syntax error at head' },
 { id: 'R4', target: 'realworld', sources: ['app.js', 'routes'], head: '2d9df7c', expected: 'needs_review', note: 'auth middleware syntax fix (Token/Bearer)' },
 { id: 'R5', target: 'realworld', sources: ['app.js', 'routes'], head: '16b0ff3', expected: 'needs_review', note: 'GET /api/articles query coercion changed' },
 { id: 'R6', target: 'realworld', sources: ['src'], head: '5eeccf1', expected: 'needs_review', note: 'TypeScript: every handler switched user key; auth module moved' },
 { id: 'R7', target: 'realworld', sources: ['src'], head: '30b68e1', expected: 'needs_review', note: 'TypeScript: auth.service.ts change behind register/login' },
];

export const SCANS = [
 { id: 'S1', target: 'boilerplate', sources: ['src'], revision: '179ae84', truthRoutes: 14, note: 'CommonJS, express.Router, router.route() chains, controllers, validate()/auth() middleware' },
 { id: 'S2', target: 'realworld', sources: ['app.js', 'routes'], revision: 'ba04b70', truthRoutes: 19, note: 'CommonJS, nested routers mounted via require(), router.param, inline handlers' },
 { id: 'S3', target: 'realworld', sources: ['src'], revision: '30b68e1', truthRoutes: 20, note: 'TypeScript, Router().use chains, async inline handlers' },
];

// Seeded mutations on a throwaway local clone at a pinned commit. Each edit is a
// realistic change; `expect` is the minimum a safe gate must report
// ('breaking', 'needs_review' = anything but a pass, or 'pass' for
// behavior-preserving edits that must not be flagged).
export const MUTATIONS = [
 { id: 'M1', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/app.js', from: "app.use('/v1', routes);", to: "app.use('/v2', routes);", expect: 'breaking', note: 'API mount prefix changed' },
 { id: 'M2', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/routes/v1/user.route.js', from: '.patch(auth(', to: '.put(auth(', expect: 'breaking', note: 'PATCH /v1/users/:userId became PUT' },
 { id: 'M3', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/routes/v1/auth.route.js', from: "router.post('/logout', validate(authValidation.logout), authController.logout);\n", to: '', expect: 'breaking', note: 'logout route deleted' },
 { id: 'M4', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/routes/v1/user.route.js', from: ".route('/:userId')", to: ".route('/:userId/:version')", expect: 'breaking', note: 'path parameter added' },
 { id: 'M5', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/validations/user.validation.js', from: 'name: Joi.string().required(),', to: 'name: Joi.string().required().min(3),', expect: 'needs_review', note: 'Joi body rule tightened (schema in imported module)' },
 { id: 'M6', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/controllers/user.controller.js', from: "res.status(httpStatus.CREATED).send(user);", to: "res.status(httpStatus.OK).send(user);", expect: 'needs_review', note: 'controller success status changed' },
 { id: 'M7', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/services/user.service.js', from: 'return User.findById(id);', to: 'return User.findById(id).lean();', expect: 'needs_review', note: 'service used by a controller changed' },
 { id: 'M8', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/middlewares/auth.js', from: "if (!hasRequiredRights && req.params.userId !== user.id) {", to: "if (!hasRequiredRights) {", expect: 'needs_review', note: 'authorization rule changed in middleware factory' },
 { id: 'M9', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/middlewares/error.js', from: 'statusCode = httpStatus.INTERNAL_SERVER_ERROR;', to: 'statusCode = httpStatus.BAD_GATEWAY;', expect: 'needs_review', note: 'error handler registered after routes changed' },
 { id: 'M10', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/routes/v1/auth.route.js', from: "router.post('/login', validate(authValidation.login), authController.login);", to: "const later = (r) => r.post('/login', validate(authValidation.login), authController.login);\nlater(router);", expect: 'needs_review', note: 'registration moved into a helper the scanner does not evaluate' },
 { id: 'M11', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/routes/v1/user.route.js', from: ".get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)", to: ".get(validate(userValidation.getUser), userController.getUser)", expect: 'needs_review', note: 'auth middleware removed from a route' },
 { id: 'M12', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/controllers/user.controller.js', from: 'const createUser = catchAsync(async (req, res) => {', to: '// Creates a user (comment only)\nconst createUser = catchAsync(async (req, res) => {\n', expect: 'pass', note: 'comment/whitespace only (false-positive guard)' },
 { id: 'M13', target: 'boilerplate', sources: ['src'], at: '179ae84', file: 'src/services/user.service.js', from: 'const getUserById = async (id) => {', to: 'const unusedHelper = () => 1;\n\nconst getUserById = async (id) => {', expect: 'pass', note: 'unused helper added to a used module (false-positive guard)' },
 { id: 'T1', target: 'realworld', sources: ['src'], at: '30b68e1', file: 'src/app/routes/routes.ts', from: "Router().use('/api', api)", to: "Router().use('/api/v2', api)", expect: 'breaking', note: 'TypeScript: API prefix changed' },
 { id: 'T2', target: 'realworld', sources: ['src'], at: '30b68e1', file: 'src/app/routes/article/article.controller.ts', from: "'/articles/feed'", to: "'/articles/my-feed'", expect: 'needs_review', note: 'TypeScript: route renamed; old URL now falls through to /articles/:slug (ruleset: route-now-matched-by-parameterized-route = needs_review)' },
 { id: 'T3', target: 'realworld', sources: ['src'], at: '30b68e1', file: 'src/app/routes/tag/tag.controller.ts', from: "router.get('/tags', auth.optional,", to: "router.get('/tags', auth.required,", expect: 'needs_review', note: 'TypeScript: optional auth became required' },
 { id: 'T4', target: 'realworld', sources: ['src'], at: '30b68e1', file: 'src/app/routes/article/article.service.ts', from: 'take: Number(query.limit) || 10,', to: 'take: Number(query.limit) || 20,', expect: 'needs_review', note: 'TypeScript: service default page size changed' },
 { id: 'T5', target: 'realworld', sources: ['src'], at: '30b68e1', file: 'src/app/routes/article/article.controller.ts', from: 'const router = Router();', to: '// Article routes\nconst router = Router();', expect: 'pass', note: 'TypeScript: comment only (false-positive guard)' },
];

export function mutations(targets) {
 return MUTATIONS.map(m => {
  const dir = mkdtempSync(join(tmpdir(), 'specgate-mutation-'));
  try {
   const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=trial', '-c', 'user.email=trial@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
   execFileSync('git', ['clone', '--quiet', '--no-hardlinks', resolve(targets, m.target), dir], { stdio: 'ignore' });
   git('checkout', '--quiet', m.at);
   const path = join(dir, m.file), before = readFileSync(path, 'utf8');
   const from = m.from.replaceAll('\\n', '\n'), to = m.to.replaceAll('\\n', '\n');
   if (!before.includes(from)) return { ...m, result: 'mutation-did-not-apply' };
   writeFileSync(path, before.replace(from, to));
   git('commit', '--quiet', '-am', `mutation ${m.id}`);
   const { code, out } = run(['diff', '--root', dir, ...m.sources.flatMap(x => ['--source', x]), '--base', 'HEAD~1', '--head', 'HEAD'], dir);
   const r = code === 2 ? null : JSON.parse(out);
   const verdict = r ? r.verdict : 'error';
   const got = verdict === 'no_breaking_change_found_in_supported_scope' ? 'pass' : verdict;
   const ok = m.expect === 'pass' ? got === 'pass' : m.expect === 'breaking' ? got === 'breaking' : got !== 'pass';
   return { ...m, exit: code, verdict: got, ok, summary: r?.summary, codes: r ? [...new Set(r.findings.map(f => f.code))].sort() : [] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
 });
}

function run(args, cwd) {
 try { return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString() }; }
 catch (error) { return { code: error.status ?? 2, out: error.stdout?.toString() ?? '' }; }
}
const sha = (root, ref) => execFileSync('git', ['-C', root, 'rev-parse', ref], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const topCodes = (list, key) => Object.entries(list.reduce((m, x) => ({ ...m, [x[key]]: (m[x[key]] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);

export function trial(targets) {
 const scans = SCANS.map(s => {
  const root = resolve(targets, s.target);
  const { code, out } = run(['scan', '--root', root, ...s.sources.flatMap(x => ['--source', x]), '--revision', sha(root, s.revision)], root);
  const r = code === 2 ? null : JSON.parse(out);
  return { ...s, exit: code, routes: r?.routes.length ?? null, gaps: r?.gaps.length ?? null, complete: r?.complete ?? null, gapCodes: r ? topCodes(r.gaps, 'code') : [], auth: r ? topCodes(r.routes, 'auth') : [] };
 });
 const pairs = PAIRS.map(p => {
  const root = resolve(targets, p.target);
  const { code, out } = run(['diff', '--root', root, ...p.sources.flatMap(x => ['--source', x]), '--base', `${p.head}~1`, '--head', p.head], root);
  if (code === 2) return { ...p, exit: 2, verdict: 'error' };
  const r = JSON.parse(out);
  const routeFindings = r.findings.filter(f => f.method).map(f => `${f.classification[0].toUpperCase()}:${f.code} ${f.method} ${f.path}${f.headPath ? ' → ' + f.headPath : ''}`);
  return { ...p, exit: code, verdict: r.verdict, summary: r.summary, routes: { base: r.base.routes, head: r.head.routes }, gapCodes: topCodes(r.findings.filter(f => f.code === 'analysis-gap'), 'gap'), routeFindings };
 });
 return { scans, pairs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const targets = process.argv[2];
 if (!targets) { process.stderr.write('usage: node scripts/real-service-trial.mjs TARGETS_DIR [--json]\n'); process.exit(2); }
 const result = trial(targets);
 if (process.argv.includes('--mutations')) result.mutations = mutations(targets);
 if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(0); }
 for (const s of result.scans) console.log(`${s.id} scan ${s.target}@${s.revision}: exit ${s.exit}, routes ${s.routes}/${s.truthRoutes}, gaps ${s.gaps}, auth [${s.auth.join(', ')}] gaps [${s.gapCodes.slice(0, 6).join(', ')}]`);
 for (const p of result.pairs) {
  console.log(`${p.id} diff ${p.target} ${p.head}~1..${p.head}: exit ${p.exit}, verdict ${p.verdict} (expected ${p.expected}) ${JSON.stringify(p.summary ?? {})} routes ${p.routes?.base}→${p.routes?.head}`);
  for (const f of (p.routeFindings ?? []).slice(0, 12)) console.log(`     ${f}`);
  if (p.gapCodes?.length) console.log(`     gaps: ${p.gapCodes.slice(0, 6).join(', ')}`);
 }
 for (const m of result.mutations ?? []) console.log(`${m.id} mutation ${m.target}@${m.at} ${m.note}: ${m.ok ? 'OK' : 'MISS'} verdict ${m.verdict ?? m.result} (expect ${m.expect}) [${(m.codes ?? []).join(', ')}]`);
}
