// Project-level Express route graph (deterministic, static, never executes code).
//
// Parses every scanned file (ESM, CommonJS, and TypeScript via Node's built-in
// type stripping), resolves `import`/`require` between scanned files, models
// `express()` apps and `express.Router()` instances, and walks mounts
// (`app.use('/api', router)`) to produce the full route inventory. Handlers and
// middleware may live in other files (controllers, middleware factories).
//
// Every route carries:
//   - its full middleware chain (mount-level + route-level), in Express order;
//   - an `evidence` digest of the chain's own code and a `depEvidence` digest of
//     the transitive dependency slice (referenced top-level symbols, imported
//     module members, module side effects), so the diff can tell whether a
//     route's behavior could have changed even when its contract is opaque;
//   - the narrow contract model from discover.mjs when every function in the
//     chain fits that grammar.
//
// Anything that could hide or alter routes and is not modeled becomes an
// `inventory` gap; handler code outside the contract grammar becomes a
// `contract` gap. Every gap carries an evidence digest so `diff` can tell a
// pre-existing, byte-identical gap from a new or changed one.
import * as acorn from 'acorn';
import { extname, posix } from 'node:path';
import { analyzeFunction, parseRoutePath, astHash, valueHash } from './discover.mjs';
import { sha256 } from './hash.mjs';

let stripTypeScriptTypes = null;
try {
 const moduleApi = await import('node:module');
 if (typeof moduleApi.stripTypeScriptTypes === 'function') stripTypeScriptTypes = moduleApi.stripTypeScriptTypes;
} catch { /* unavailable: TypeScript stays an unsupported-language gap */ }

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const UNMODELED_ROUTE_METHODS = new Set(['all', 'options', 'head']);
const HARMLESS_APP_METHODS = new Set(['listen', 'set', 'enable', 'disable', 'engine', 'disabled', 'enabled']);
const EXPRESSISH_NAMES = new Set(['app', 'router', 'api', 'server', 'routes', 'route']);
const BENIGN_PARSERS = new Set(['express:json', 'express:urlencoded', 'express:text', 'express:raw', 'body-parser:json', 'body-parser:urlencoded', 'body-parser:text', 'body-parser:raw']);
const JS_EXT = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'];
const MAX_MOUNT_DEPTH = 24;
const MAX_UNROLL = 64;
const MAX_RESOLVE_DEPTH = 200;

const h = (...parts) => sha256(JSON.stringify(parts));

// ---------------------------------------------------------------------------
// Parsing

function isDeclarationFile(path) { return /\.d\.[cm]?ts$/.test(path); }

export function parseProjectFile(path, source) {
 const ext = extname(path);
 if (isDeclarationFile(path)) return { path, source, skip: true };
 if (ext === '.tsx' || ext === '.jsx') return { path, source, gap: { code: 'unsupported-language', line: null } };
 let code = source, lang = 'js';
 if (ext === '.ts' || ext === '.mts' || ext === '.cts') {
  if (!stripTypeScriptTypes) return { path, source, gap: { code: 'unsupported-language', line: null } };
  lang = 'ts';
  try { code = stripTypeScriptTypes(source, { mode: 'strip' }); }
  catch {
   // Non-erasable syntax (enums, parameter properties, namespaces). Transform
   // mode keeps semantics but not exact columns/lines for those constructs.
   try { code = stripTypeScriptTypes(source, { mode: 'transform', sourceMap: false }); lang = 'ts-transformed'; }
   catch (error) { return { path, source, gap: { code: 'typescript-syntax-error', line: error?.loc?.line ?? null } }; }
  }
 }
 const base = { ecmaVersion: 'latest', locations: true, allowHashBang: true };
 const asScript = () => acorn.parse(code, { ...base, sourceType: 'script', allowReturnOutsideFunction: true });
 const asModule = () => acorn.parse(code, { ...base, sourceType: 'module' });
 const order = ext === '.cjs' || ext === '.cts' ? [asScript] : ext === '.mjs' || ext === '.mts' ? [asModule] : [asModule, asScript];
 let firstError = null;
 for (const attempt of order) {
  try { return { path, source, code, lang, ast: attempt() }; }
  catch (error) { firstError ??= error; }
 }
 return { path, source, gap: { code: 'parse-error', line: firstError?.loc?.line ?? null } };
}

// ---------------------------------------------------------------------------
// AST helpers

function walkWithParent(node, visit, parent = null, key = null) {
 if (!node || typeof node.type !== 'string') return;
 if (visit(node, parent, key) === false) return;
 for (const [k, value] of Object.entries(node)) {
  if (k === 'loc') continue;
  if (Array.isArray(value)) { for (const child of value) walkWithParent(child, visit, node, k); }
  else if (value && typeof value.type === 'string') walkWithParent(value, visit, node, k);
 }
}

// Identifiers referenced by `node`, with the member names accessed on each
// (`svc.login` → svc: {login}); `null` means the identifier is used bare.
function referencesOf(node) {
 const refs = new Map();
 walkWithParent(node, (child, parent, key) => {
  if (child.type !== 'Identifier') return;
  if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
  if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && key === 'key' && !parent.computed && !parent.shorthand) return;
  if (parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') return;
  if (/Function/.test(parent?.type ?? '') && (key === 'id' || key === 'params')) return;
  if ((parent?.type === 'VariableDeclarator' || parent?.type === 'ClassDeclaration' || parent?.type === 'ClassExpression') && key === 'id') return;
  const memberAccess = parent?.type === 'MemberExpression' && key === 'object' && !parent.computed && parent.property.type === 'Identifier';
  const current = refs.has(child.name) ? refs.get(child.name) : new Set();
  if (current === null) return;
  if (memberAccess) current.add(parent.property.name);
  refs.set(child.name, memberAccess ? current : null);
 });
 return refs;
}

function requireSpec(node) {
 if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== 'require') return null;
 if (node.arguments.length !== 1) return null;
 const arg = node.arguments[0];
 if (arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
 if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) return arg.quasis[0].value.cooked;
 return null;
}

function staticString(node) {
 if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
 if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
 return null;
}

function propertyName(node) {
 if (!node.computed && node.key.type === 'Identifier') return node.key.name;
 if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
 return null;
}

function isModuleExports(node) {
 return node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === 'module' && node.property.name === 'exports';
}

function exportsMember(node) {
 // module.exports.name / exports.name
 if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return null;
 if (isModuleExports(node.object)) return node.property.name;
 if (node.object.type === 'Identifier' && node.object.name === 'exports') return node.property.name;
 return null;
}

function rootIdentifier(node) {
 let current = node;
 while (current) {
  if (current.type === 'Identifier') return current;
  if (current.type === 'MemberExpression') current = current.object;
  else if (current.type === 'CallExpression') current = current.callee;
  else return null;
 }
 return null;
}

// Short, literal-free label for reports. String/number arguments are elided.
export function labelOf(node) {
 if (!node) return '?';
 if (node.type === 'Identifier') return node.name;
 if (node.type === 'ThisExpression') return 'this';
 if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return `${labelOf(node.object)}.${node.property.name}`;
 if (node.type === 'CallExpression') {
  if (requireSpec(node)) return `require(${requireSpec(node).startsWith('.') ? requireSpec(node) : '…'})`;
  const args = node.arguments.map((a) => (a.type === 'Identifier' || (a.type === 'MemberExpression' && !a.computed)) ? labelOf(a) : '…');
  return `${labelOf(node.callee)}(${args.join(', ')})`;
 }
 if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return `(inline ${node.async ? 'async ' : ''}function)`;
 return `(${node.type})`;
}

// ---------------------------------------------------------------------------
// Module model

function buildModule(parsed) {
 const mod = {
  file: parsed.path, source: parsed.code, ast: parsed.ast, lang: parsed.lang,
  bindings: new Map(), // name -> { kind:'import', spec, imported } | { kind:'decl', node, stmt, init, fn }
  exports: new Map(), // name -> { kind:'local', name } | { kind:'expr', node } | { kind:'reexport', spec, imported }
  starExports: [],
  sideEffectImports: [],
  importsForContract: new Map(),
  constants: new Map(), // literal top-level const name -> value
  topStatements: parsed.ast.body,
 };
 const declare = (name, binding) => { if (!mod.bindings.has(name)) mod.bindings.set(name, binding); };
 const declareVariable = (declarator, stmt) => {
  const spec = requireSpec(declarator.init);
  // const x = require('m').member
  const memberOfRequire = declarator.init?.type === 'MemberExpression' && !declarator.init.computed && requireSpec(declarator.init.object);
  if (declarator.id.type === 'Identifier') {
   if (spec) {
    declare(declarator.id.name, { kind: 'import', spec, imported: 'module', stmt });
    mod.importsForContract.set(declarator.id.name, { module: spec, imported: 'default' });
   } else if (memberOfRequire) {
    declare(declarator.id.name, { kind: 'import', spec: memberOfRequire, imported: declarator.init.property.name, stmt });
    mod.importsForContract.set(declarator.id.name, { module: memberOfRequire, imported: declarator.init.property.name });
   } else {
    declare(declarator.id.name, { kind: 'decl', node: declarator, stmt, init: declarator.init });
    if (stmt.kind === 'const' && declarator.init?.type === 'Literal') mod.constants.set(declarator.id.name, declarator.init.value);
   }
   return;
  }
  if (declarator.id.type === 'ObjectPattern' && spec) {
   for (const prop of declarator.id.properties) {
    if (prop.type === 'Property' && prop.value.type === 'Identifier' && propertyName(prop)) {
     declare(prop.value.name, { kind: 'import', spec, imported: propertyName(prop), stmt });
     mod.importsForContract.set(prop.value.name, { module: spec, imported: propertyName(prop) });
    }
   }
   return;
  }
  // Other destructuring: names are bound to an opaque declaration slice.
  walkWithParent(declarator.id, (child, parent, key) => {
   if (child.type === 'Identifier' && !(parent?.type === 'Property' && key === 'key' && !parent.shorthand)) declare(child.name, { kind: 'decl', node: declarator, stmt, init: null, opaque: true });
  });
 };
 for (const stmt of parsed.ast.body) {
  if (stmt.type === 'ImportDeclaration') {
   const spec = stmt.source.value;
   if (!stmt.specifiers.length) mod.sideEffectImports.push(spec);
   for (const s of stmt.specifiers) {
    const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (s.imported.name ?? s.imported.value);
    declare(s.local.name, { kind: 'import', spec, imported, stmt });
    mod.importsForContract.set(s.local.name, { module: spec, imported });
   }
   continue;
  }
  const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt;
  if (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') {
   if (decl.id) declare(decl.id.name, { kind: 'decl', node: decl, stmt, fn: decl.type === 'FunctionDeclaration' ? decl : null });
  } else if (decl?.type === 'VariableDeclaration') {
   for (const declarator of decl.declarations) declareVariable(declarator, decl);
  }
  if (stmt.type === 'ExportNamedDeclaration') {
   if (stmt.declaration) {
    if (stmt.declaration.id) mod.exports.set(stmt.declaration.id.name, { kind: 'local', name: stmt.declaration.id.name });
    for (const d of stmt.declaration.declarations ?? []) if (d.id.type === 'Identifier') mod.exports.set(d.id.name, { kind: 'local', name: d.id.name });
   }
   for (const s of stmt.specifiers ?? []) {
    const exported = s.exported.name ?? s.exported.value, local = s.local.name ?? s.local.value;
    mod.exports.set(exported, stmt.source ? { kind: 'reexport', spec: stmt.source.value, imported: local } : { kind: 'local', name: local });
   }
  } else if (stmt.type === 'ExportDefaultDeclaration') {
   const d = stmt.declaration;
   mod.exports.set('default', (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id ? { kind: 'local', name: d.id.name } : { kind: 'expr', node: d });
  } else if (stmt.type === 'ExportAllDeclaration') {
   if (stmt.exported) mod.exports.set(stmt.exported.name ?? stmt.exported.value, { kind: 'reexport', spec: stmt.source.value, imported: '*' });
   else mod.starExports.push(stmt.source.value);
  } else if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && stmt.expression.operator === '=') {
   const { left, right } = stmt.expression;
   if (isModuleExports(left)) mod.exports.set('default', { kind: 'expr', node: right, cjs: true });
   else if (exportsMember(left)) mod.exports.set(exportsMember(left), { kind: 'expr', node: right });
  } else if (stmt.type === 'ExpressionStatement' && requireSpec(stmt.expression)) {
   mod.sideEffectImports.push(requireSpec(stmt.expression));
  }
 }
 return mod;
}

// ---------------------------------------------------------------------------
// Project analysis

export function analyzeProject(files) {
 const gaps = [];
 const fileFacts = {};
 const modules = new Map();
 for (const file of files) {
  const parsed = parseProjectFile(file.path, file.source);
  if (parsed.skip) { fileFacts[file.path] = { astHash: sha256(file.source), imports: [], constants: {} }; continue; }
  if (parsed.gap) {
   gaps.push({ file: file.path, line: parsed.gap.line, code: parsed.gap.code, scope: 'inventory', evidence: h('source', sha256(file.source)) });
   fileFacts[file.path] = { astHash: null, imports: [], constants: {} };
   continue;
  }
  const mod = buildModule(parsed);
  modules.set(file.path, mod);
  fileFacts[file.path] = {
   astHash: astHash(parsed.ast),
   imports: [...new Set([...mod.bindings.values()].filter((b) => b.kind === 'import').map((b) => b.spec).concat(mod.sideEffectImports))].sort(),
   constants: Object.fromEntries([...mod.constants].map(([name, value]) => [name, valueHash(value)])),
  };
 }
 const project = new Project(modules, gaps);
 project.evaluateAll();
 const routes = project.collectRoutes();
 project.finalizeGaps();
 return { routes, gaps: project.gaps, fileFacts, unreadable: files.filter((f) => !modules.has(f.path)).map((f) => f.path) };
}

class Project {
 constructor(modules, gaps) {
  this.modules = modules;
  this.gaps = gaps;
  this.callMemo = new WeakMap();
  this.registered = new WeakSet(); // call nodes recognized as registrations
  this.handledCalls = new WeakSet();
  this.routers = [];
  this.routerSeq = 0;
  this.evidenceMemo = new Map();
  this.analysisMemo = new WeakMap();
  this.gapKeys = new Set();
  this.gapStatements = new WeakSet();
  this.modeledCalls = new WeakSet();
  this.depsMemo = new Map();
  this.depth = 0;
  this.resolving = new Set(); // calls inside unrolled route-table callbacks
 }

 gap(mod, node, code, scope, evidence) {
  const line = node?.loc?.start.line ?? null;
  const key = `${mod?.file}\u0000${line}\u0000${code}`;
  if (this.gapKeys.has(key)) return;
  this.gapKeys.add(key);
  // Evidence is computed after evaluation (finalizeGaps): computing it now
  // would memoize module side effects before all registrations are known.
  this.gaps.push({ file: mod?.file ?? null, line, code, scope, evidence: evidence ?? null, pending: evidence ? null : { mod, node } });
 }

 finalizeGaps() {
  for (const g of this.gaps) {
   if (g.pending) g.evidence = g.pending.mod && g.pending.node ? this.exprEvidence(g.pending.mod, g.pending.node) : h(g.code);
   delete g.pending;
  }
 }

 // --- module resolution -----------------------------------------------------
 resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  const candidates = [base, ...JS_EXT.map((e) => base + e), ...JS_EXT.map((e) => `${base}/index${e}`)];
  if (/\.(m|c)?js$/.test(base)) candidates.push(base.replace(/\.(m|c)?js$/, (m) => m.replace('js', 'ts')));
  for (const candidate of candidates) if (this.modules.has(candidate)) return this.modules.get(candidate);
  return null;
 }

 requireValue(mod, spec) {
  if (!spec.startsWith('.')) return { k: 'ext', spec, path: [] };
  const target = this.resolveSpec(mod.file, spec);
  if (!target) return { k: 'missing', spec };
  // require() of a CommonJS module yields module.exports.
  if (target.exports.get('default')?.cjs) return this.exportValue(target, 'default');
  return { k: 'module', mod: target };
 }

 moduleRef(mod, spec) {
  const target = this.resolveSpec(mod.file, spec);
  return target ? { k: 'module', mod: target } : (spec.startsWith('.') ? { k: 'missing', spec } : { k: 'ext', spec, path: [] });
 }

 importValue(mod, binding) {
  if (binding.imported === 'module') return this.requireValue(mod, binding.spec);
  const base = this.moduleRef(mod, binding.spec);
  if (binding.imported === '*') return base;
  if (binding.imported === 'default') {
   if (base.k === 'module') return this.exportValue(base.mod, 'default');
   return base; // external default import is the package itself
  }
  return this.member(base, binding.imported);
 }

 exportValue(mod, name, seen = new Set()) {
  const key = `${mod.file}#${name}`;
  if (seen.has(key)) return { k: 'unknown', why: 'export-cycle' };
  seen.add(key);
  const entry = mod.exports.get(name);
  if (entry?.kind === 'local') return this.identifierValue(mod, entry.name, null);
  if (entry?.kind === 'expr') return this.resolve(mod, entry.node, null);
  if (entry?.kind === 'reexport') {
   const target = this.moduleRef(mod, entry.spec);
   if (target.k !== 'module') return target.k === 'ext' ? { k: 'ext', spec: target.spec, path: [entry.imported] } : target;
   return entry.imported === '*' ? target : this.exportValue(target.mod, entry.imported, seen);
  }
  if (name === 'default' && !mod.exports.has('default')) {
   // ESM default import of a module without one: namespace-like (TS esModuleInterop).
   return { k: 'module', mod, implicitDefault: true };
  }
  if (mod.exports.has('default') && mod.exports.get('default').cjs) return this.member(this.exportValue(mod, 'default', seen), name);
  for (const spec of mod.starExports) {
   const target = this.moduleRef(mod, spec);
   if (target.k === 'module' && (target.mod.exports.has(name) || target.mod.starExports.length)) return this.exportValue(target.mod, name, seen);
  }
  return { k: 'unknown', why: 'missing-export' };
 }

 // --- value resolution ------------------------------------------------------
 identifierValue(mod, name, env) {
  if (env?.has(name)) return env.get(name);
  const binding = mod.bindings.get(name);
  if (!binding) return { k: 'unknown', why: 'unbound-identifier', name };
  if (binding.kind === 'import') return this.importValue(mod, binding);
  if (binding.fn) return { k: 'fn', mod, node: binding.fn, name };
  if (binding.opaque || !binding.init) return { k: 'opaque', mod, node: binding.node, name };
  const value = this.resolve(mod, binding.init, null);
  return value.k === 'fn' && !value.name ? { ...value, name } : value;
 }

 member(value, prop) {
  if (value.k === 'module') {
   if (value.implicitDefault) return this.exportValue(value.mod, prop);
   return this.exportValue(value.mod, prop);
  }
  if (value.k === 'obj') {
   for (const p of value.node.properties) {
    if (p.type !== 'Property' || propertyName(p) !== prop) continue;
    return this.resolve(value.mod, p.value, value.env);
   }
   return { k: 'unknown', why: 'missing-property' };
  }
  if (value.k === 'ext') return { k: 'ext', spec: value.spec, path: [...value.path, prop] };
  if (value.k === 'missing') return value;
  return { k: 'unknown', why: `member-of-${value.k}` };
 }

 resolve(mod, node, env) {
  if (!node) return { k: 'unknown', why: 'empty' };
  // Cyclic definitions (const a = b; const b = a; mutually requiring
  // module.exports) must degrade to unknown, not exhaust the stack.
  if (this.depth >= MAX_RESOLVE_DEPTH || this.resolving.has(node)) return { k: 'unknown', why: 'cyclic-or-deep-definition', node };
  this.depth += 1;
  this.resolving.add(node);
  try { return this.resolveNode(mod, node, env); }
  finally { this.depth -= 1; this.resolving.delete(node); }
 }

 resolveNode(mod, node, env) {
  switch (node.type) {
   case 'Literal': return { k: 'lit', value: node.value };
   case 'TemplateLiteral': return node.expressions.length === 0 ? { k: 'lit', value: node.quasis[0].value.cooked } : { k: 'unknown', why: 'template', node };
   case 'Identifier': return this.identifierValue(mod, node.name, env);
   case 'MemberExpression': {
    if (node.computed) return { k: 'unknown', why: 'computed-member', node };
    return this.member(this.resolve(mod, node.object, env), node.property.name);
   }
   case 'CallExpression': return this.evalCall(mod, node, env);
   case 'FunctionExpression': case 'ArrowFunctionExpression': return { k: 'fn', mod, node };
   case 'ObjectExpression': return { k: 'obj', mod, node, env };
   case 'ArrayExpression': return { k: 'arr', mod, node, env };
   case 'ParenthesizedExpression': return this.resolve(mod, node.expression, env);
   case 'ChainExpression': return this.resolve(mod, node.expression, env);
   case 'NewExpression': return { k: 'opaque', mod, node };
   default: return { k: 'unknown', why: node.type, node };
  }
 }

 newRouter(kind, mod, node, verified) {
  const router = { k: kind, id: `${kind}#${this.routerSeq++}`, mod, node, verified, regs: [], mountedBy: 0 };
  this.routers.push(router);
  if (!verified) this.gap(mod, node, 'unverified-express-binding', 'inventory');
  return router;
 }

 evalCall(mod, node, env) {
  const memoizable = !env || env.size === 0;
  if (memoizable && this.callMemo.has(node)) return this.callMemo.get(node);
  const value = this.evalCallUncached(mod, node, env);
  if (memoizable) this.callMemo.set(node, value);
  return value;
 }

 evalCallUncached(mod, node, env) {
  const spec = requireSpec(node);
  if (spec && !mod.bindings.has('require')) return this.requireValue(mod, spec);
  const callee = node.callee;
  // Registration on an app/router/route builder: obj.method(...)
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
   const target = this.resolve(mod, callee.object, env);
   if (target.k === 'app' || target.k === 'router' || target.k === 'builder') return this.register(mod, node, target, callee.property.name, env);
   if (target.k === 'ext' && target.spec === 'express' && target.path.length === 1 && target.path[0] === 'Router') {
    return this.newRouter('router', mod, node, true);
   }
  }
  const fn = this.resolve(mod, callee, env);
  if (fn.k === 'ext' && fn.spec === 'express' && fn.path.length === 0) return this.newRouter('app', mod, node, true);
  if (fn.k === 'ext' && fn.spec === 'express' && fn.path.length === 1 && fn.path[0] === 'Router') return this.newRouter('router', mod, node, true);
  // Unverified look-alikes keep their routes visible but are flagged.
  if (callee.type === 'Identifier' && callee.name === 'express') return this.newRouter('app', mod, node, false);
  if ((callee.type === 'Identifier' && callee.name === 'Router') || (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'Router' && labelOf(callee.object) === 'express')) {
   return this.newRouter('router', mod, node, false);
  }
  return { k: 'call', mod, node, env, callee: fn };
 }

 register(mod, node, target, method, env) {
  this.registered.add(node);
  const reg = { mod, node, method, env, line: node.loc.start.line, conditional: insideConditional(mod, node), order: [mod.file, node.start, this.regSeq = (this.regSeq ?? 0) + 1] };
  const args = node.arguments;
  if (target.k === 'builder') {
   if (ROUTE_METHODS.has(method)) {
    target.router.regs.push({ ...reg, type: 'route', method, pathValue: target.pathValue, pathNode: target.pathNode, args, builder: target });
    return target;
   }
   if (method === 'all' || UNMODELED_ROUTE_METHODS.has(method)) { this.gap(mod, node, 'unsupported-route-method', 'inventory'); return target; }
   this.gap(mod, node, 'unclassified-express-call', 'inventory');
   return target;
  }
  const router = target;
  if (router.mod !== mod) this.gap(mod, node, 'cross-module-registration', 'inventory');
  if (ROUTE_METHODS.has(method)) {
   if (method === 'get' && args.length === 1 && router.k === 'app') return { k: 'opaque', mod, node }; // app.get(setting)
   if (args.length < 2) { this.gap(mod, node, 'unsupported-route-arity', 'inventory'); return router; }
   router.regs.push({ ...reg, type: 'route', pathValue: this.resolve(mod, args[0], env), pathNode: args[0], args: args.slice(1) });
   return router;
  }
  if (method === 'route') {
   if (args.length !== 1) { this.gap(mod, node, 'unsupported-route-arity', 'inventory'); return { k: 'unknown', why: 'route-builder' }; }
   return { k: 'builder', router, pathValue: this.resolve(mod, args[0], env), pathNode: args[0], node };
  }
  if (method === 'use') {
   if (!args.length) { this.gap(mod, node, 'unsupported-route-arity', 'inventory'); return router; }
   const first = this.resolve(mod, args[0], env);
   const hasPath = first.k === 'lit' || (args[0].type === 'TemplateLiteral') || args[0].type === 'ArrayExpression' || (first.k === 'unknown' && first.why === 'template');
   router.regs.push({ ...reg, type: 'use', pathValue: hasPath ? first : null, pathNode: hasPath ? args[0] : null, args: hasPath ? args.slice(1) : args });
   return router;
  }
  if (method === 'param') {
   const name = staticString(args[0]);
   if (!name || args.length !== 2) { this.gap(mod, node, 'unsupported-param-middleware', 'inventory'); return router; }
   router.regs.push({ ...reg, type: 'param', name, args: [args[1]] });
   return router;
  }
  if (UNMODELED_ROUTE_METHODS.has(method)) { this.gap(mod, node, 'unsupported-route-method', 'inventory'); return router; }
  if (router.k === 'app' && HARMLESS_APP_METHODS.has(method)) return { k: 'opaque', mod, node };
  this.gap(mod, node, 'unclassified-express-call', 'inventory');
  return router;
 }

 // --- statement evaluation ---------------------------------------------------
 evaluateAll() {
  for (const mod of [...this.modules.values()].sort((a, b) => (a.file < b.file ? -1 : 1))) {
   for (const stmt of mod.topStatements) this.evaluateStatement(mod, stmt, null);
  }
  for (const mod of this.modules.values()) this.sweepUnhandled(mod);
 }

 evaluateStatement(mod, stmt, env) {
  switch (stmt.type) {
   case 'ExpressionStatement': return this.evaluateExpressionStatement(mod, stmt, env);
   case 'VariableDeclaration':
    for (const d of stmt.declarations) if (d.init) this.touch(mod, d.init, env);
    return;
   case 'ExportNamedDeclaration':
    if (stmt.declaration?.type === 'VariableDeclaration') return this.evaluateStatement(mod, stmt.declaration, env);
    return;
   case 'ExportDefaultDeclaration':
    if (!stmt.declaration.type.endsWith('Declaration')) this.touch(mod, stmt.declaration, env);
    return;
   case 'IfStatement': {
    const before = this.registeredCount();
    this.evaluateBlock(mod, stmt.consequent, env);
    if (stmt.alternate) this.evaluateBlock(mod, stmt.alternate, env);
    if (this.registeredCount() !== before) this.gap(mod, stmt, 'conditional-registration', 'inventory');
    return;
   }
   case 'BlockStatement': return this.evaluateBlock(mod, stmt, env);
   case 'TryStatement': return this.evaluateBlock(mod, stmt.block, env);
   default:
    return;
  }
 }

 evaluateBlock(mod, node, env) {
  const body = node.type === 'BlockStatement' ? node.body : [node];
  for (const s of body) this.evaluateStatement(mod, s, env);
 }

 registeredCount() { return this.routers.reduce((n, r) => n + r.regs.length, 0); }

 // Evaluate an expression for its registration side effects only.
 touch(mod, node, env) {
  if (node.type === 'CallExpression') { this.resolve(mod, node, env); return; }
  if (node.type === 'AssignmentExpression') { this.touch(mod, node.right, env); return; }
  if (node.type === 'SequenceExpression') { for (const e of node.expressions) this.touch(mod, e, env); }
 }

 evaluateExpressionStatement(mod, stmt, env) {
  const expr = stmt.expression;
  if (expr.type === 'AssignmentExpression') return this.touch(mod, expr.right, env);
  if (expr.type !== 'CallExpression') return this.touch(mod, expr, env);
  // LIST.forEach((item) => { router.use(item.path, item.route); }) over a literal array.
  if (expr.callee.type === 'MemberExpression' && !expr.callee.computed && expr.callee.property.name === 'forEach' && expr.arguments.length === 1) {
   const list = this.resolve(mod, expr.callee.object, env);
   const fn = expr.arguments[0];
   const body = fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression' ? fn.body : null;
   if (list.k === 'arr' && body && fn.params.every((p) => p.type === 'Identifier') && list.node.elements.length <= MAX_UNROLL && list.node.elements.every((e) => e && e.type !== 'SpreadElement')) {
    const before = this.registeredCount();
    list.node.elements.forEach((element, index) => {
     const inner = new Map(env ?? []);
     if (fn.params[0]) inner.set(fn.params[0].name, this.resolve(list.mod, element, list.env));
     if (fn.params[1]) inner.set(fn.params[1].name, { k: 'lit', value: index });
     if (body.type === 'BlockStatement') this.evaluateBlock(mod, body, inner);
     else this.touch(mod, body, inner);
    });
    // Modeled even when the table is empty: its registrations are per route.
    this.handledCalls.add(expr);
    walkWithParent(body, (child) => { if (child.type === 'CallExpression') this.modeledCalls.add(child); });
    void before;
    return;
   }
  }
  // Express object handed to another scanned function: routes may be registered there.
  for (const arg of expr.arguments) {
   if (arg.type !== 'Identifier') continue;
   const v = this.identifierValue(mod, arg.name, env);
   if (v.k !== 'app' && v.k !== 'router') continue;
   const callee = this.resolve(mod, expr.callee, env);
   const isRegistration = expr.callee.type === 'MemberExpression' && ['app', 'router', 'builder'].includes(this.resolve(mod, expr.callee.object, env).k);
   if (!isRegistration && callee.k !== 'ext') {
    this.gap(mod, expr, 'express-object-escapes', 'inventory');
    this.gapStatements.add(stmt); // covered by the gap, not by side-effect evidence
   }
  }
  this.resolve(mod, expr, env);
 }

 // Any remaining obj.get/post/use/route(...) on an Express-looking object that
 // was not evaluated (inside functions, loops, callbacks) is an inventory gap.
 sweepUnhandled(mod) {
  walkWithParent(mod.ast, (node) => {
   if (node.type !== 'CallExpression' || this.registered.has(node) || this.handledCalls.has(node) || this.modeledCalls.has(node)) return;
   const callee = node.callee;
   if (callee.type !== 'MemberExpression') return;
   const root = rootIdentifier(callee.object) ?? { name: '' };
   const bound = root.name && mod.bindings.get(root.name);
   let expressValue = false;
   if (bound) {
    const v = this.identifierValue(mod, root.name, null);
    expressValue = v.k === 'app' || v.k === 'router';
   }
   // app[verb](...): the registration method is not statically known, so any
   // route it adds is invisible to the inventory. Report it, never drop it.
   if (callee.computed) {
    if (expressValue || EXPRESSISH_NAMES.has(root.name)) this.gap(mod, node, 'computed-method', 'inventory');
    return;
   }
   if (callee.property.type !== 'Identifier') return;
   const method = callee.property.name;
   if (!ROUTE_METHODS.has(method) && !UNMODELED_ROUTE_METHODS.has(method) && !['use', 'route', 'param'].includes(method)) return;
   if (method === 'get' && node.arguments.length < 2) return;
   const first = staticString(node.arguments[0]);
   const routeLike = first !== null && first.startsWith('/') && node.arguments.length >= 2;
   if (expressValue || EXPRESSISH_NAMES.has(root.name) || routeLike) this.gap(mod, node, 'unresolved-registration', 'inventory');
  });
 }

 // --- mount walk -------------------------------------------------------------
 collectRoutes() {
  const apps = this.routers.filter((r) => r.k === 'app');
  const out = [];
  const visited = new Set();
  // Count mounts so unmounted routers can be identified.
  for (const r of this.routers) for (const reg of r.regs) if (reg.type === 'use') for (const arg of reg.args) {
   const v = this.resolve(reg.mod, arg, reg.env);
   if (v.k === 'router' || v.k === 'app') v.mountedBy += 1;
  }
  for (const app of apps) if (!app.mountedBy) this.walkRouter(app, '', [], [], 0, false, out, visited, []);
  const unvisited = this.routers.filter((r) => !visited.has(r.id) && r.regs.length);
  for (const router of unvisited) {
   if (router.mountedBy) continue; // reached only from something we could not walk; reported there
   if (apps.length) { this.gap(router.mod, router.node, 'unmounted-router', 'inventory'); continue; }
   this.gap(router.mod, router.node, 'router-mount-not-in-scope', 'inventory');
   this.walkRouter(router, '', [], [], 0, false, out, visited, []);
  }
  return out;
 }

 walkRouter(router, prefix, inherited, inheritedTrailing, depth, conditional, out, visited, stack) {
  if (depth > MAX_MOUNT_DEPTH || stack.includes(router.id)) { this.gap(router.mod, router.node, 'mount-cycle', 'inventory'); return; }
  visited.add(router.id);
  const regs = [...router.regs].sort((a, b) => (a.order[0] < b.order[0] ? -1 : a.order[0] > b.order[0] ? 1 : a.order[1] - b.order[1] || a.order[2] - b.order[2]));
  const local = [];
  const params = regs.filter((r) => r.type === 'param');
  regs.forEach((reg, index) => {
   const cond = conditional || reg.conditional;
   const trailing = () => [...regs.slice(index + 1).filter((r) => r.type === 'use').flatMap((r) => r.args.map((arg) => ({ reg: r, arg }))), ...inheritedTrailing];
   if (reg.type === 'param') return;
   if (reg.type === 'route') {
    const localPath = reg.pathValue.k === 'lit' && typeof reg.pathValue.value === 'string' ? reg.pathValue.value : null;
    if (localPath === null) { this.gap(reg.mod, reg.node, reg.pathNode.type === 'TemplateLiteral' ? 'template-path' : 'non-literal-path', 'inventory'); return; }
    const full = joinPath(prefix, localPath);
    if (full !== '/' && !parseRoutePath(full)) { this.gap(reg.mod, reg.node, 'unsupported-path-syntax', 'inventory'); return; }
    const paramLayers = params.filter((p) => localPath.split('/').includes(`:${p.name}`)).map((p) => ({ reg: p, arg: p.args[0], param: true }));
    const leading = [...inherited, ...local.filter((l) => !l.pathPrefix || pathUnder(full, l.pathPrefix))];
    out.push(this.buildRoute(reg, full, leading, paramLayers, trailing(), cond));
    return;
   }
   // use
   let mountPath = '';
   if (reg.pathValue) {
    if (reg.pathValue.k !== 'lit' || typeof reg.pathValue.value !== 'string') { this.gap(reg.mod, reg.node, 'non-literal-mount-path', 'inventory'); return; }
    mountPath = reg.pathValue.value;
   }
   const at = joinPath(prefix, mountPath);
   if (mountPath && at !== '/' && !parseRoutePath(at)) { this.gap(reg.mod, reg.node, 'unsupported-path-syntax', 'inventory'); return; }
   reg.args.forEach((arg, argIndex) => {
    const value = this.resolve(reg.mod, arg, reg.env);
    if (value.k === 'router' || value.k === 'app') {
     const before = [...inherited, ...local.filter((l) => !l.pathPrefix || pathUnder(at, l.pathPrefix))];
     const after = [...reg.args.slice(argIndex + 1).map((a) => ({ reg, arg: a })), ...trailing()];
     this.walkRouter(value, at === '/' ? '' : at, before, after, depth + 1, cond, out, visited, [...stack, router.id]);
     return;
    }
    if (!this.isKnownMiddleware(value)) {
     // Could be a router we cannot see: routes may be hidden behind this mount.
     this.gap(reg.mod, arg.loc ? arg : reg.node, value.k === 'missing' || value.callee?.k === 'missing' ? 'mount-outside-scope' : 'unresolved-middleware-or-router', 'inventory');
    }
    local.push({ reg, arg, value, pathPrefix: mountPath ? at : null, conditional: cond });
   });
  });
 }

 // --- per-route facts --------------------------------------------------------
 buildRoute(reg, path, leading, paramLayers, trailing, conditional) {
  const chain = [
   ...leading.map((l) => ({ reg: l.reg, arg: l.arg, layer: true })),
   ...paramLayers.map((p) => ({ reg: p.reg, arg: p.arg, layer: true, param: true })),
   ...reg.args.map((arg, index) => ({ reg, arg, layer: false, index })),
  ];
  const elements = chain.map((c) => ({ ...c, value: this.resolve(c.reg.mod, c.arg, c.reg.env) }));
  const handler = elements.at(-1);
  const verified = this.isVerified(reg);
  const infos = [];
  let resolved = true;
  const labels = [];
  const contractGaps = [];
  for (const el of elements) {
   const benign = el.layer && this.isBenign(el.value);
   if (!benign && el !== handler) labels.push(labelOf(el.arg));
   if (benign) continue;
   if (el.value.k === 'fn') {
    const info = this.analyzeFn(el, reg);
    infos.push({ el, info });
    continue;
   }
   resolved = false;
   if (el.value.k === 'unknown' || el.value.k === 'missing') {
    if (!el.layer) this.gap(reg.mod, el.arg, el.value.k === 'missing' ? 'handler-outside-scope' : 'unresolved-handler-or-middleware', 'contract');
   } else {
    contractGaps.push(el);
    this.gap(el.layer ? el.reg.mod : reg.mod, el.arg, el === handler ? 'handler-outside-contract-subset' : 'middleware-outside-contract-subset', 'contract', this.elementEvidence(el));
   }
  }
  const handlerInfo = handler.value.k === 'fn' ? infos.find((i) => i.el === handler)?.info ?? null : null;
  const middlewareInfos = infos.filter((i) => i.el !== handler).map((i) => i.info);
  const authGate = infos.some((i) => i.info.authGate);
  const auth = !verified || !resolved || !handlerInfo ? null : authGate;
  const validation = [...middlewareInfos.flatMap((i) => i.validation), ...(handlerInfo?.validation ?? [])];
  const evidence = h('chain', elements.map((el) => this.ownHash(el)));
  const depParts = [];
  const depFiles = new Set();
  const constRefs = [];
  const depByElement = {};
  for (const el of elements) {
   const d = this.elementDeps(el, depFiles, constRefs);
   depParts.push(d);
   depByElement[this.ownHash(el)] = d;
  }
  const trailingParts = trailing.map((t) => {
   const value = this.resolve(t.reg.mod, t.arg, t.reg.env);
   if (value.k === 'router' || value.k === 'app') return 'router';
   if (!this.isKnownMiddleware(value)) return null; // already an inventory gap
   const el = { reg: t.reg, arg: t.arg, value, layer: true };
   return [this.ownHash(el), this.elementDeps(el, depFiles, [])];
  }).filter(Boolean);
  const chainInfos = [...middlewareInfos, ...(handlerInfo ? [handlerInfo] : [])];
  const analyzable = verified && resolved && Boolean(handlerInfo) && chainInfos.every((fn) => fn.unsupportedCount === 0);
  const contract = {
   analyzable,
   checks: chainInfos.flatMap((fn) => fn.validation).map((v) => ({
    in: v.kind === 'auth_header' ? 'header' : v.target?.in ?? 'unknown',
    name: v.kind === 'auth_header' ? 'authorization' : v.target?.name ?? null,
    kind: v.kind,
    optional: v.optional === true,
    expectedType: v.expectedType ?? null,
    minLength: v.minLength ?? null,
    maxLength: v.maxLength ?? null,
    enumHashes: Array.isArray(v.values) ? [...new Set(v.values.map(valueHash))].sort() : null,
    rejectStatus: v.observedRejection?.status ?? null,
   })),
   responses: handlerInfo ? handlerInfo.terminalResponses.map((r) => ({ status: r.status, ...responseShape(r, handlerInfo) })) : [],
   calls: [...new Set(chainInfos.flatMap((fn) => fn.calls.map((c) => c.module)))].sort(),
   evidence,
   depEvidence: h('deps', depParts),
   depByElement,
   trailingEvidence: h('trailing', trailingParts),
   depFiles: [...depFiles].sort(),
   constRefs: uniqueBy(constRefs, (c) => `${c.file}#${c.name}`).sort((a, b) => (a.file + a.name < b.file + b.name ? -1 : 1)),
   middleware: labels,
   conditional,
  };
  return {
   method: reg.method.toUpperCase(),
   path,
   file: reg.mod.file,
   line: reg.line,
   handler: handlerLabel(handler, reg),
   handlerFile: handler.value.mod?.file ?? null,
   middleware: labels,
   conditional,
   verified,
   auth,
   validation,
   terminalResponses: handlerInfo?.terminalResponses ?? [],
   contract,
  };
 }

 isVerified(reg) {
  // A registration is verified when every router on its path was created from
  // the real `express` package; look-alikes are flagged by the caller.
  const owner = this.routers.find((r) => r.regs.includes(reg));
  return owner ? owner.verified : false;
 }

 // A `use` argument we can classify as middleware (not a hidden router):
 // a function, an external package value/call, or a call to a scanned function
 // that provably returns a function (middleware factory).
 isKnownMiddleware(value) {
  if (value.k === 'fn' || value.k === 'ext') return true;
  if (value.k !== 'call') return false;
  if (value.callee.k === 'ext') return true;
  if (value.callee.k === 'fn') return returnsFunction(value.callee.node);
  return false;
 }

 isBenign(value) {
  if (value.k !== 'call' || value.callee.k !== 'ext' || value.callee.path.length !== 1) return false;
  return BENIGN_PARSERS.has(`${value.callee.spec}:${value.callee.path[0]}`);
 }

 analyzeFn(el, reg) {
  const node = el.value.node;
  if (this.analysisMemo.has(node)) return this.analysisMemo.get(node);
  const mod = el.value.mod;
  const unsupported = [];
  let info;
  if (node.body.type !== 'BlockStatement') {
   info = { name: el.value.name ?? 'inline', line: node.loc.start.line, validation: [], terminalResponses: [], calls: [], dto: [], authGate: false, unsupportedCount: 1 };
   unsupported.push({ line: node.loc.start.line, pattern: 'expression-bodied-handler' });
  } else {
   const name = node.id?.name ?? el.value.name ?? (el.layer ? `inline_${node.loc.start.line}_${node.start}` : `inline_${reg.line}_${reg.node.start}_${el.index}`);
   const fn = node.type === 'FunctionDeclaration' && node.id ? node : { ...node, type: 'FunctionDeclaration', id: { type: 'Identifier', name } };
   info = analyzeFunction(fn, mod.file, mod.source, mod.importsForContract, new WeakSet(), unsupported);
  }
  for (const u of unsupported) this.gaps.push({ file: mod.file, line: u.line, code: u.pattern, scope: 'contract', evidence: this.ownHash(el) });
  this.analysisMemo.set(node, info);
  return info;
 }

 // --- evidence ---------------------------------------------------------------
 ownHash(el) {
  const v = el.value;
  if (v.k === 'fn') return h('fn', astHash({ ...v.node, id: null, type: 'Function' }));
  if (v.k === 'call') return h('call', astHash(v.node), this.calleeOwn(v.callee));
  if (v.k === 'ext') return h('ext', v.spec, v.path);
  if (v.k === 'missing') return h('missing', v.spec);
  if (v.k === 'opaque') return h('opaque', astHash(v.node));
  if (v.k === 'obj' || v.k === 'arr') return h(v.k, astHash(v.node));
  return h('unknown', v.why ?? '', labelOf(el.arg));
 }

 calleeOwn(callee) {
  if (callee.k === 'fn') return h('fn', astHash({ ...callee.node, id: null, type: 'Function' }));
  if (callee.k === 'ext') return h('ext', callee.spec, callee.path);
  if (callee.k === 'call') return h('call', astHash(callee.node), this.calleeOwn(callee.callee));
  return h(callee.k);
 }

 // Evidence is computed as a closure over dependency nodes. Each node has a
 // local hash (its own code, independent of traversal) and outgoing edges. The
 // digest of a root is the sorted multiset of local hashes reachable from it,
 // so cycles (module A ↔ B, app ↔ side effects) and traversal order cannot make
 // identical code produce different evidence.
 elementDeps(el, depFiles, constRefs) {
  // Many routes share the same app/router-level middleware: memoize per element.
  const v = el.value;
  const memoKey = !el.reg.env?.size && v.node && v.mod ? `${v.k}|${v.mod.file}|${v.node.start}|${v.node.type}|${el.layer}|${el.arg.start}|${el.reg.mod.file}` : null;
  if (memoKey && this.depsMemo.has(memoKey)) {
   const hit = this.depsMemo.get(memoKey);
   for (const f of hit.files) depFiles.add(f);
   if (constRefs) constRefs.push(...hit.constRefs);
   return hit.digest;
  }
  const files = new Set(), refs = [];
  const digest = this.elementDepsUncached(el, files, refs);
  if (memoKey) this.depsMemo.set(memoKey, { digest, files, constRefs: refs });
  for (const f of files) depFiles.add(f);
  if (constRefs) constRefs.push(...refs);
  return digest;
 }

 elementDepsUncached(el, depFiles, constRefs) {
  const v = el.value;
  const edges = [];
  if (v.k === 'fn' || v.k === 'call' || v.k === 'opaque' || v.k === 'obj' || v.k === 'arr') {
   edges.push(...this.refEdges(v.mod, v.node, el.layer ? null : constRefs, v.env));
  } else {
   // Unresolved/external element: depend on whatever its expression references.
   edges.push(...this.refEdges(el.reg.mod, el.arg, null, el.reg.env));
  }
  let callee = v.k === 'call' ? v.callee : null;
  while (callee) {
   if (callee.k === 'fn' || callee.k === 'opaque' || callee.k === 'call') edges.push(...this.refEdges(callee.mod, callee.node, null, callee.env));
   callee = callee.k === 'call' ? callee.callee : null;
  }
  return this.closure(edges, depFiles);
 }

 // Edges for every top-level symbol / import member / required module that
 // `node` references, plus the module's side effects. Literal constants
 // referenced directly are reported through constRefs when given.
 refEdges(mod, node, constRefs, env) {
  const edges = [`side|${mod.file}`];
  for (const [name, members] of referencesOf(node)) {
   if (env?.has(name)) continue;
   const binding = mod.bindings.get(name);
   if (!binding) continue;
   if (constRefs && binding.kind === 'decl' && mod.constants.has(name)) { constRefs.push({ file: mod.file, name }); continue; }
   if (binding.kind === 'import') edges.push(...this.importEdges(mod, binding, members));
   else edges.push(`sym|${mod.file}|${name}`);
  }
  for (const spec of requireSpecsIn(node)) edges.push(this.moduleEdge(mod, spec));
  return edges;
 }

 moduleEdge(mod, spec) {
  if (!spec.startsWith('.')) return `ext|${spec}|*`;
  const target = this.resolveSpec(mod.file, spec);
  return target ? `mod|${target.file}` : `missing|${spec}`;
 }

 importEdges(mod, binding, members) {
  if (!binding.spec.startsWith('.')) return [`ext|${binding.spec}|${binding.imported}`];
  const target = this.resolveSpec(mod.file, binding.spec);
  if (!target) return [`missing|${binding.spec}`];
  const list = members && members.size ? [...members].sort() : null;
  if (binding.imported === 'module' || binding.imported === '*') {
   return list ? list.map((m) => `exp|${target.file}|${m}|`) : [`mod|${target.file}`];
  }
  return [`exp|${target.file}|${binding.imported}|${list ? list.join(',') : ''}`];
 }

 closure(roots, depFiles) {
  const seen = new Set();
  const queue = [...roots];
  const locals = [];
  while (queue.length) {
   const key = queue.pop();
   if (seen.has(key)) continue;
   seen.add(key);
   const node = this.expand(key);
   if (node.local) locals.push(node.local);
   if (node.file) depFiles.add(node.file);
   for (const e of node.edges) if (!seen.has(e)) queue.push(e);
  }
  return h('closure', locals.sort());
 }

 expand(key) {
  if (this.evidenceMemo.has(key)) return this.evidenceMemo.get(key);
  const result = this.expandUncached(key);
  this.evidenceMemo.set(key, result);
  return result;
 }

 expandUncached(key) {
  const [kind, ...rest] = key.split('|');
  if (kind === 'ext') return { local: h('ext', rest[0], rest[1]), edges: [] };
  if (kind === 'missing') return { local: h('missing', rest[0]), edges: [] };
  const mod = this.modules.get(rest[0]);
  if (!mod) return { local: h('missing-file', rest[0]), edges: [] };
  const file = mod.file;
  if (kind === 'mod') {
   const specs = [...new Set([...mod.bindings.values()].filter((b) => b.kind === 'import').map((b) => b.spec).concat(mod.sideEffectImports, requireSpecsIn(mod.ast)))].sort();
   return { file, local: h('module', astHash(mod.ast)), edges: specs.filter((s) => s.startsWith('.')).map((s) => this.moduleEdge(mod, s)) };
  }
  if (kind === 'side') {
   const stmts = [];
   const edges = [];
   for (const stmt of mod.topStatements) {
    if (stmt.type === 'ImportDeclaration') { if (!stmt.specifiers.length) edges.push(this.moduleEdge(mod, stmt.source.value)); continue; }
    if (/Declaration$/.test(stmt.type)) continue; // covered by symbol and export nodes
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression' && (isModuleExports(stmt.expression.left) || exportsMember(stmt.expression.left))) continue;
    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'Literal') continue; // directives
    // Registrations (also inside top-level if/try blocks) are modeled per route.
    const effect = this.withoutRegistrations(stmt);
    if (!effect) continue;
    stmts.push(astHash(effect));
    edges.push(...this.refEdges(mod, effect, null, null).filter((x) => x !== `side|${file}`));
   }
   // Loading this module also runs the top-level side effects of every scanned
   // module it loads (declaration initializers are treated as pure).
   for (const spec of [...new Set([...mod.bindings.values()].filter((b) => b.kind === 'import').map((b) => b.spec))].sort()) {
    const target = spec.startsWith('.') ? this.resolveSpec(file, spec) : null;
    if (target) edges.push(`side|${target.file}`);
   }
   return { file, local: stmts.length ? h('side', file, stmts) : null, edges };
  }
  if (kind === 'sym') {
   const binding = mod.bindings.get(rest[1]);
   if (!binding) return { file, local: h('unbound'), edges: [] };
   if (binding.kind === 'import') return { file, local: h('alias'), edges: this.importEdges(mod, binding, null) };
   const node = binding.node;
   const own = node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' ? { ...node, id: null } : node;
   return { file, local: h('sym', astHash(own)), edges: this.refEdges(mod, node, null, null) };
  }
  if (kind === 'exp') {
   const [, name, memberText] = rest;
   const members = memberText ? new Set(memberText.split(',')) : null;
   const local = h('exp', name, memberText);
   const entry = mod.exports.get(name);
   const side = `side|${file}`;
   if (entry?.kind === 'local') {
    const binding = mod.bindings.get(entry.name);
    if (!binding) return { file, local, edges: [side] };
    if (binding.kind === 'import') return { file, local, edges: [side, ...this.importEdges(mod, binding, members)] };
    return { file, local, edges: [side, `sym|${file}|${entry.name}`] };
   }
   if (entry?.kind === 'expr') return { file, local, edges: [side, ...this.memberEdges(mod, entry.node, members)] };
   if (entry?.kind === 'reexport') return { file, local, edges: [side, ...this.importEdges(mod, { spec: entry.spec, imported: entry.imported }, members)] };
   const cjs = mod.exports.get('default');
   if (cjs?.cjs) return { file, local, edges: [side, ...this.memberEdges(mod, cjs.node, new Set([name]))] };
   for (const spec of mod.starExports) {
    const target = this.resolveSpec(file, spec);
    if (target && (target.exports.has(name) || target.starExports.length)) return { file, local, edges: [side, `exp|${target.file}|${name}|${memberText}`] };
   }
   return { file, local, edges: [side, `mod|${file}`] };
  }
  if (kind === 'expr') {
   // Generic expression node, addressed by source offset.
   const node = findByStart(mod.ast, Number(rest[1]), rest[2]);
   if (!node) return { file, local: h('expr-missing'), edges: [`mod|${file}`] };
   return { file, local: h('expr', astHash(node)), edges: this.refEdges(mod, node, null, null) };
  }
  return { local: h('unknown-node', kind), edges: [] };
 }

 withoutRegistrations(stmt) {
  if (this.gapStatements.has(stmt)) return null;
  if (stmt.type === 'ExpressionStatement') {
   const e = stmt.expression;
   if (e.type === 'CallExpression' && (this.registered.has(e) || this.modeledCalls.has(e))) return null;
   if (e.type === 'CallExpression' && this.handledCalls.has(e)) {
    // Unrolled route table: keep it only if its callback does anything besides registering.
    const body = e.arguments[0].body;
    const rest = body.type === 'BlockStatement' ? this.withoutRegistrations(body) : (body.type === 'CallExpression' && (this.registered.has(body) || this.modeledCalls.has(body)) ? null : body);
    return !rest || (rest.type === 'BlockStatement' && !rest.body.length) ? null : stmt;
   }
   return stmt;
  }
  if (stmt.type === 'BlockStatement') {
   const body = stmt.body.map((s) => this.withoutRegistrations(s)).filter(Boolean);
   return { ...stmt, body };
  }
  if (stmt.type === 'IfStatement') {
   const consequent = this.withoutRegistrations(stmt.consequent) ?? { type: 'EmptyStatement' };
   const alternate = stmt.alternate ? this.withoutRegistrations(stmt.alternate) ?? { type: 'EmptyStatement' } : null;
   const empty = (n) => !n || n.type === 'EmptyStatement' || (n.type === 'BlockStatement' && !n.body.length);
   // The condition itself is evidence of the conditional routes; it is compared via the gap.
   if (empty(consequent) && empty(alternate)) return null;
   return { ...stmt, consequent, alternate };
  }
  if (stmt.type === 'TryStatement') return { ...stmt, block: this.withoutRegistrations(stmt.block) ?? { type: 'BlockStatement', body: [] } };
  return stmt;
 }

 // Edges for `node` restricted to the given member names when it is an object
 // literal or a module reference (barrel files, CommonJS export objects).
 memberEdges(mod, node, members) {
  if (members && members.size) {
   if (node.type === 'ObjectExpression' && node.properties.every((p) => p.type === 'Property' && propertyName(p))) {
    return [...members].sort().flatMap((m) => {
     const prop = node.properties.find((p) => propertyName(p) === m);
     return prop ? this.memberEdges(mod, prop.value, null) : [];
    });
   }
   const spec = requireSpec(node);
   if (spec) {
    const target = this.resolveSpec(mod.file, spec);
    if (target) return [...members].sort().map((m) => `exp|${target.file}|${m}|`);
   }
   if (node.type === 'Identifier') {
    const binding = mod.bindings.get(node.name);
    if (binding?.kind === 'import') return this.importEdges(mod, binding, members);
    if (binding?.kind === 'decl' && binding.init && !binding.fn) return this.memberEdges(mod, binding.init, members);
   }
  }
  if (node.type === 'Identifier') {
   const binding = mod.bindings.get(node.name);
   if (binding?.kind === 'import') return this.importEdges(mod, binding, null);
   if (binding) return [`sym|${mod.file}|${node.name}`];
  }
  const spec = requireSpec(node);
  if (spec) return [this.moduleEdge(mod, spec)];
  return [`expr|${mod.file}|${node.start}|${node.type}`];
 }

 // Evidence for an inventory gap at a statement or expression.
 exprEvidence(mod, node) {
  return h('gap', astHash(node), this.closure(this.refEdges(mod, node, null, null), new Set()));
 }

 elementEvidence(el) {
  return h('element', this.ownHash(el), this.elementDeps(el, new Set(), []));
 }
}

// Registrations evaluated inside a top-level `if` only run under that condition.
function findByStart(ast, start, type) {
 let found = null;
 walkWithParent(ast, (child) => { if (found) return false; if (child.start === start && child.type === type) { found = child; return false; } return child.start <= start && child.end >= start; });
 return found;
}

function insideConditional(mod, node) {
 mod.conditionalRanges ??= mod.topStatements.filter((s) => s.type === 'IfStatement').map((s) => [s.start, s.end]);
 return mod.conditionalRanges.some(([a, b]) => node.start >= a && node.end <= b);
}

// Does this function always return a function (e.g. `(schema) => (req, res, next) => {}`)?
function returnsFunction(fn) {
 const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');
 if (fn.body.type !== 'BlockStatement') return isFn(fn.body);
 const returns = [];
 walkWithParent(fn.body, (child) => {
  if (child !== fn.body && /Function/.test(child.type)) return false;
  if (child.type === 'ReturnStatement') returns.push(child.argument);
 });
 return returns.length > 0 && returns.every(isFn);
}

function requireSpecsIn(node) {
 const specs = [];
 walkWithParent(node, (child) => { const s = requireSpec(child); if (s) specs.push(s); });
 return [...new Set(specs)].sort();
}

function joinPath(prefix, path) {
 const joined = `${prefix}/${path}`.replace(/\/+/g, '/');
 const trimmed = joined.length > 1 ? joined.replace(/\/$/, '') : joined;
 return trimmed || '/';
}

function pathUnder(path, prefix) {
 if (prefix === '/' || prefix === '') return true;
 return path === prefix || path.startsWith(prefix + '/');
}

function uniqueBy(list, key) {
 const seen = new Set();
 return list.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}

function handlerLabel(handler, reg) {
 if (handler.arg.type === 'ArrowFunctionExpression' || handler.arg.type === 'FunctionExpression') return `inline_${reg.line}_${reg.node.start}_${handler.index}`;
 return labelOf(handler.arg);
}

// Same response-shape model as the single-file contract (discover.mjs).
function literalType(value) { return value === null ? 'null' : typeof value; }
function responseShape(response, handler) {
 if (response.bodyKind === 'literal') {
  const fields = {};
  for (const [name, value] of Object.entries(response.literal)) fields[name] = { type: literalType(value), valueHash: valueHash(value) };
  return { known: true, fields };
 }
 const dto = handler.dto.find((entry) => entry.local === response.name);
 if (!dto) return { known: false, fields: {} };
 const typed = new Map(handler.validation
  .filter((v) => !v.optional && v.local && ((v.kind === 'type' && v.expectedType) || v.kind === 'enum'))
  .map((v) => [v.local, v.kind === 'enum' ? 'string' : v.expectedType]));
 const fields = {};
 for (const key of dto.keys) {
  if (key.kind === 'literal') fields[key.name] = { type: literalType(key.literal), valueHash: valueHash(key.literal) };
  else {
   const local = key.kind === 'shorthand' ? key.name : key.kind === 'identifier' ? key.identifier : null;
   fields[key.name] = { type: (local && typed.get(local)) || 'unknown', valueHash: null };
  }
 }
 return { known: true, fields };
}
