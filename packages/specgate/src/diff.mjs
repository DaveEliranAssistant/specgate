// SpecGate Mode B (preview): "Will this PR break my API consumers?"
// Scans two Git revisions with the same deterministic scanner used by `scan`,
// then classifies route-level contract changes. No OpenAPI, no model, no
// network, and the scanned service is never started or imported.
//
// Classifications:
//   breaking      statically provable consumer break within the supported subset
//   needs_review  anything that changed but cannot be proven safe or breaking,
//                 every analysis gap, and security-relevant loosening
//   non_breaking  additive changes (new route/method/response field, relaxed input)
// The absence of findings is never a compatibility guarantee.
import { posix } from 'node:path';
import { canonical, hash, seal, analyzeRepository } from './scan.mjs';
import { validateScan } from './gate.mjs';
import { resolveCommit, mergeBase } from './git-source.mjs';

export const DIFF_SCHEMA = 'specgate.diff/1';
export const RULESET = 'express-consumer-break-v1';
const RANK = { breaking: 0, needs_review: 1, non_breaking: 2 };
export const EXIT_MEANING = Object.freeze({
 0: 'No breaking change and nothing needing review was found within the supported static subset. NOT a compatibility guarantee.',
 1: 'At least one breaking change or needs-review item (including any analysis gap).',
 2: 'Unreadable input, unresolvable ref, unsafe path, resource limit or analysis failure.',
});

const MESSAGES = {
 'route-removed': 'Route no longer registered; existing calls will get 404 or fall through to other handlers.',
 'method-removed': 'Path still exists but this HTTP method is no longer registered.',
 'route-now-matched-by-parameterized-route': 'Literal route removed, but its URL is now captured by a parameterized route with a different handler. Behavior for existing calls is not statically provable.',
 'path-param-renamed': 'Path parameter renamed. URL shape is unchanged on the wire, but clients/SDKs that address parameters by name (generated clients, OpenAPI consumers) may need updating.',
 'path-param-added': 'Path gained a parameter segment; the previous URL no longer matches this route.',
 'route-added': 'New route.',
 'method-added': 'New HTTP method on an existing path.',
 'auth-gate-added': 'Route now requires a bearer authorization header; existing unauthenticated calls are rejected.',
 'auth-gate-removed': 'Observed authorization check is gone. Not a consumer break, but security-relevant.',
 'required-request-field-added': 'New required request input; existing requests without it are rejected.',
 'request-field-became-required': 'Previously optional request input is now required.',
 'request-field-became-optional': 'Previously required request input is now optional.',
 'request-field-type-changed': 'Expected type of a request input changed.',
 'request-constraint-tightened': 'Request input constraint tightened (length bound, new check on an existing input).',
 'request-constraint-relaxed': 'Request input constraint relaxed.',
 'request-enum-value-removed': 'An accepted enum value is no longer accepted (values not echoed).',
 'request-enum-value-added': 'Enum accepts additional values.',
 'request-validation-removed': 'All observed checks on this input were removed.',
 'optional-request-field-constrained': 'A check was added to an optional input; requests that send it with other values may now be rejected.',
 'unattributed-validation-changed': 'A check whose input could not be attributed to body/params/headers changed.',
 'rejection-status-changed': 'Status code returned when this input is rejected changed.',
 'response-status-changed': 'Success response status code changed.',
 'response-status-removed': 'A previously returned success status is no longer returned.',
 'response-status-added': 'Handler can now return an additional success status.',
 'response-field-removed': 'Response field removed.',
 'response-field-type-changed': 'Statically visible response field type changed.',
 'response-field-added': 'Response field added.',
 'response-literal-value-changed': 'A literal response value changed (values not echoed).',
 'handler-dependency-changed': 'A scanned module this handler imports (directly or transitively) changed; effects on the response are not statically visible.',
 'referenced-constant-changed': 'A top-level constant this handler references changed (value not echoed).',
 'unmodeled-behavior-changed': 'Handler code changed and part of its behavior is outside the static model (see reasons).',
 'route-contract-not-analyzable': 'Route handler or middleware is outside the supported subset; its contract was not compared.',
 'analysis-gap': 'Source the scanner cannot model. Routes or behavior may be hidden here.',
};

const segs = path => path.split('/').slice(1);
const shapeOf = path => segs(path).map(s => s.startsWith(':') ? ':' : s).join('/');
const locOf = route => route ? { file: route.file, line: route.line } : null;

function finding(classification, code, route, extra = {}) {
 return { classification, code, method: route.method, path: route.path, routeId: route.id, ...extra, message: MESSAGES[code] };
}

// Does an Express pattern (head) capture the concrete literal path (base)?
function patternCaptures(pattern, literalPath) {
 const p = segs(pattern), l = segs(literalPath);
 return p.length === l.length && p.every((s, i) => s.startsWith(':') ? !l[i].startsWith(':') && l[i] !== '' : s === l[i]);
}

// head path == base path with one or more extra `:param` segments inserted.
function addsParams(basePath, headPath) {
 const b = segs(basePath).map(s => s.startsWith(':') ? ':' : s), h = segs(headPath).map(s => s.startsWith(':') ? ':' : s);
 if (h.length <= b.length) return false;
 let i = 0;
 for (const s of h) { if (i < b.length && s === b[i]) i++; else if (s !== ':') return false; }
 return i === b.length;
}

function depDigest(route, contract, facts) {
 // Transitive closure over relative imports of the handler's imported calls, within scanned files only.
 const seen = new Set(), queue = [], unresolved = [];
 const resolveSpec = (from, spec) => {
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const candidate of [base, base + '.mjs', base + '.js', base + '/index.mjs', base + '/index.js']) if (facts[candidate]) return candidate;
  return null;
 };
 for (const spec of contract.calls) if (spec.startsWith('.')) { const r = resolveSpec(route.file, spec); r ? queue.push(r) : unresolved.push(spec); }
 while (queue.length) {
  const file = queue.shift(); if (seen.has(file)) continue; seen.add(file);
  for (const spec of facts[file].imports) if (spec.startsWith('.')) { const r = resolveSpec(file, spec); r ? queue.push(r) : unresolved.push(spec); }
 }
 return { files: [...seen].sort(), digest: hash(canonical({ asts: [...seen].map(f => facts[f].astHash).sort(), unresolved: unresolved.sort() })) };
}

function modelGaps(contract) {
 const reasons = [];
 if (!contract.analyzable) reasons.push('handler-outside-supported-subset');
 if (contract.calls.length) reasons.push('calls-imported-functions');
 if (!contract.responses.length) reasons.push('no-terminal-response-observed');
 for (const r of contract.responses) {
  if (!r.known) reasons.push(`response-shape-not-visible:${r.status}`);
  else for (const [name, f] of Object.entries(r.fields)) if (f.type === 'unknown') reasons.push(`response-field-type-not-visible:${r.status}.${name}`);
 }
 return [...new Set(reasons)].sort();
}

function compareChecks(b, h, route, out) {
 const groups = side => {
  const map = new Map(), unknown = [];
  for (const c of side.checks) {
   if (c.kind === 'auth_header') continue; // reported via auth-gate-* findings
   if (c.in === 'unknown' || !c.name) { unknown.push(canonical({ ...c, in: undefined, name: undefined })); continue; }
   const key = `${c.in}\u0000${c.name}`;
   if (!map.has(key)) map.set(key, []);
   map.get(key).push(c);
  }
  return { map, unknown: unknown.sort() };
 };
 const B = groups(b), H = groups(h);
 for (const key of [...new Set([...B.map.keys(), ...H.map.keys()])].sort()) {
  const bc = B.map.get(key) ?? [], hc = H.map.get(key) ?? [];
  const [where, name] = key.split('\u0000'), target = { in: where, name };
  const bReq = bc.some(c => !c.optional), hReq = hc.some(c => !c.optional);
  if (!bc.length) {
   if (hReq) out.push(finding('breaking', where === 'param' ? 'request-constraint-tightened' : 'required-request-field-added', route, { target }));
   else out.push(finding('needs_review', 'optional-request-field-constrained', route, { target }));
   continue;
  }
  if (!hc.length) { out.push(finding('non_breaking', 'request-validation-removed', route, { target })); continue; }
  if (!bReq && hReq) out.push(finding('breaking', 'request-field-became-required', route, { target }));
  if (bReq && !hReq) out.push(finding('non_breaking', 'request-field-became-optional', route, { target }));
  const byKind = list => new Map(list.map(c => [c.kind, c]));
  const bk = byKind(bc), hk = byKind(hc);
  for (const kind of [...new Set([...bk.keys(), ...hk.keys()])].sort()) {
   const x = bk.get(kind), y = hk.get(kind);
   if (!x) { out.push(finding(y.optional ? 'needs_review' : 'breaking', y.optional ? 'optional-request-field-constrained' : 'request-constraint-tightened', route, { target, check: kind })); continue; }
   if (!y) { out.push(finding('non_breaking', 'request-constraint-relaxed', route, { target, check: kind })); continue; }
   if (x.rejectStatus !== y.rejectStatus) out.push(finding('breaking', 'rejection-status-changed', route, { target, check: kind, before: x.rejectStatus, after: y.rejectStatus }));
   if (kind === 'type' && x.expectedType !== y.expectedType) out.push(finding('breaking', 'request-field-type-changed', route, { target, before: x.expectedType, after: y.expectedType }));
   if (kind === 'length' || kind === 'type') {
    const tighter = (y.minLength ?? 0) > (x.minLength ?? 0) || (y.maxLength ?? Infinity) < (x.maxLength ?? Infinity);
    const looser = (y.minLength ?? 0) < (x.minLength ?? 0) || (y.maxLength ?? Infinity) > (x.maxLength ?? Infinity);
    const bounds = { before: { minLength: x.minLength, maxLength: x.maxLength }, after: { minLength: y.minLength, maxLength: y.maxLength } };
    if (tighter) out.push(finding('breaking', 'request-constraint-tightened', route, { target, check: kind, ...bounds }));
    else if (looser) out.push(finding('non_breaking', 'request-constraint-relaxed', route, { target, check: kind, ...bounds }));
   }
   if (kind === 'enum') {
    const before = new Set(x.enumHashes ?? []), after = new Set(y.enumHashes ?? []);
    const removed = [...before].filter(v => !after.has(v)).length, added = [...after].filter(v => !before.has(v)).length;
    if (removed) out.push(finding('breaking', 'request-enum-value-removed', route, { target, count: removed }));
    if (added) out.push(finding('non_breaking', 'request-enum-value-added', route, { target, count: added }));
   }
  }
 }
 if (canonical(B.unknown) !== canonical(H.unknown)) out.push(finding('needs_review', 'unattributed-validation-changed', route));
}

function compareResponses(b, h, route, evidenceChanged, out) {
 const bStatuses = [...new Set(b.responses.map(r => r.status))].sort((x, y) => x - y);
 const hStatuses = [...new Set(h.responses.map(r => r.status))].sort((x, y) => x - y);
 const removed = bStatuses.filter(s => !hStatuses.includes(s)), added = hStatuses.filter(s => !bStatuses.includes(s));
 if (removed.length && added.length) out.push(finding('breaking', 'response-status-changed', route, { before: removed, after: added }));
 else if (removed.length) out.push(finding('breaking', 'response-status-removed', route, { before: removed, after: hStatuses }));
 else if (added.length) out.push(finding('needs_review', 'response-status-added', route, { before: bStatuses, after: added }));
 const pairs = [];
 if (b.responses.length === 1 && h.responses.length === 1) pairs.push([b.responses[0], h.responses[0]]);
 else for (const s of bStatuses) if (hStatuses.includes(s)) pairs.push([b.responses.find(r => r.status === s), h.responses.find(r => r.status === s)]);
 for (const [x, y] of pairs) {
  if (!x.known || !y.known) continue; // reported through unmodeled-behavior-changed when code changed
  const status = y.status;
  for (const name of Object.keys(x.fields).sort()) {
   const f = x.fields[name], g = y.fields[name];
   if (!g) { out.push(finding('breaking', 'response-field-removed', route, { status, field: name })); continue; }
   if (f.type !== 'unknown' && g.type !== 'unknown' && f.type !== g.type) out.push(finding('breaking', 'response-field-type-changed', route, { status, field: name, before: f.type, after: g.type }));
   else if (f.valueHash && g.valueHash && f.valueHash !== g.valueHash && evidenceChanged) out.push(finding('needs_review', 'response-literal-value-changed', route, { status, field: name }));
  }
  for (const name of Object.keys(y.fields).sort()) if (!x.fields[name]) out.push(finding('non_breaking', 'response-field-added', route, { status, field: name }));
 }
}

function compareRoute(br, hr, base, head, out) {
 const b = base.contracts[br.id], h = head.contracts[hr.id];
 const route = { ...hr, id: hr.id, method: hr.method, path: hr.path };
 const locations = { base: locOf(br), head: locOf(hr) };
 const local = [];
 if (!b || !h || !b.analyzable || !h.analyzable) {
  local.push(finding('needs_review', 'route-contract-not-analyzable', route, { sides: [...(!b?.analyzable ? ['base'] : []), ...(!h?.analyzable ? ['head'] : [])] }));
 }
 if (b && h) {
  if (br.auth === 'not_observed' && hr.auth === 'gate_observed') local.push(finding('breaking', 'auth-gate-added', route));
  if (br.auth === 'gate_observed' && hr.auth === 'not_observed') local.push(finding('needs_review', 'auth-gate-removed', route));
  const evidenceChanged = b.evidence !== h.evidence;
  compareChecks(b, h, route, local);
  compareResponses(b, h, route, evidenceChanged, local);
  const bd = depDigest(br, b, base.fileFacts), hd = depDigest(hr, h, head.fileFacts);
  if (bd.digest !== hd.digest) local.push(finding('needs_review', 'handler-dependency-changed', route, { files: [...new Set([...bd.files, ...hd.files])].sort() }));
  const constants = (side, r, c) => Object.fromEntries(c.constRefs.map(n => [n, side.fileFacts[r.file]?.constants[n] ?? null]));
  const bc = constants(base, br, b), hc = constants(head, hr, h);
  const changedConstants = [...new Set([...Object.keys(bc), ...Object.keys(hc)])].filter(n => n in bc && n in hc && bc[n] !== hc[n]).sort();
  if (changedConstants.length) local.push(finding('needs_review', 'referenced-constant-changed', route, { constants: changedConstants }));
  const reasons = [...new Set([...modelGaps(b), ...modelGaps(h)])].sort();
  if (evidenceChanged && reasons.length && b.analyzable && h.analyzable) local.push(finding('needs_review', 'unmodeled-behavior-changed', route, { reasons }));
 }
 for (const f of local) out.push({ ...f, locations });
}

function gapFindings(base, head) {
 const groups = new Map();
 for (const [side, scan] of [['base', base.scan], ['head', head.scan]]) for (const g of scan.gaps) {
  const key = `${g.file ?? ''}\u0000${g.code}`;
  if (!groups.has(key)) groups.set(key, { file: g.file, gap: g.code, lines: { base: [], head: [] } });
  if (g.line != null) groups.get(key).lines[side].push(g.line);
  groups.get(key).lines[side].present = true;
 }
 return [...groups.values()].map(g => ({
  classification: 'needs_review', code: 'analysis-gap', gap: g.gap, file: g.file,
  sides: ['base', 'head'].filter(s => g.lines[s].present),
  lines: { base: [...g.lines.base].sort((a, b) => a - b), head: [...g.lines.head].sort((a, b) => a - b) },
  message: MESSAGES['analysis-gap'],
 }));
}

const sortKey = f => [RANK[f.classification], f.method ?? '~', f.path ?? '~', f.code, f.file ?? '', canonical(f)];
function compareFindings(a, b) {
 const x = sortKey(a), y = sortKey(b);
 for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; }
 return 0;
}

// Pure classification over two contract-mode analyses. Exported for tests.
export function classifyChanges(base, head) {
 validateScan(base.scan); validateScan(head.scan);
 if (canonical(base.scan.scopes) !== canonical(head.scan.scopes)) throw new Error('Source scopes differ');
 const firstById = routes => { const m = new Map(); for (const r of routes) if (!m.has(r.id)) m.set(r.id, r); return m; };
 const B = firstById(base.scan.routes), H = firstById(head.scan.routes);
 const out = [];
 const removed = [...B.values()].filter(r => !H.has(r.id)).sort((a, b) => a.id < b.id ? -1 : 1);
 const added = new Map([...H.values()].filter(r => !B.has(r.id)).sort((a, b) => a.id < b.id ? -1 : 1).map(r => [r.id, r]));
 for (const [id, br] of B) if (H.has(id)) compareRoute(br, H.get(id), base, head, out);
 const unpaired = [];
 for (const br of removed) {
  const sameMethod = [...added.values()].filter(a => a.method === br.method);
  const renamed = sameMethod.find(a => shapeOf(a.path) === shapeOf(br.path));
  const extended = renamed ? null : sameMethod.find(a => addsParams(br.path, a.path));
  const pair = renamed ?? extended;
  if (pair) {
   added.delete(pair.id);
   // Owner policy: a renamed parameter with the same route shape is not provably
   // breaking (raw URLs still match), so it needs review. A changed shape is breaking.
   const code = renamed ? 'path-param-renamed' : 'path-param-added';
   out.push({ ...finding(renamed ? 'needs_review' : 'breaking', code, br, { headPath: pair.path, headRouteId: pair.id }), locations: { base: locOf(br), head: locOf(pair) } });
   compareRoute(br, pair, base, head, out);
  } else unpaired.push(br);
 }
 for (const br of unpaired) {
  const headRoutes = [...H.values()];
  const captured = headRoutes.some(h => h.method === br.method && h.path !== br.path && patternCaptures(h.path, br.path));
  const pathStillExists = headRoutes.some(h => h.path === br.path);
  const code = captured ? 'route-now-matched-by-parameterized-route' : pathStillExists ? 'method-removed' : 'route-removed';
  // If head has analysis gaps, the route may have moved somewhere the scanner cannot see
  // (e.g. an Express Router). Absence is then not provable, so it is review, not breaking.
  const hidden = !captured && head.scan.gaps.length > 0;
  out.push({ ...finding(captured || hidden ? 'needs_review' : 'breaking', code, br, hidden ? { notProvable: 'head-scan-has-analysis-gaps' } : {}), locations: { base: locOf(br), head: null } });
 }
 for (const hr of added.values()) {
  const pathExisted = [...B.values()].some(b => b.path === hr.path);
  out.push({ ...finding('non_breaking', pathExisted ? 'method-added' : 'route-added', hr), locations: { base: null, head: locOf(hr) } });
 }
 out.push(...gapFindings(base, head));
 out.sort(compareFindings);
 const findings = out.map((f, i) => ({ id: `F${String(i + 1).padStart(3, '0')}`, ...f }));
 const count = c => findings.filter(f => f.classification === c).length;
 const summary = { breaking: count('breaking'), needs_review: count('needs_review'), non_breaking: count('non_breaking') };
 const verdict = summary.breaking ? 'breaking' : summary.needs_review ? 'needs_review' : 'no_breaking_change_found_in_supported_scope';

 // Coverage: what the "no finding" parts of the report actually rest on.
 const matched = [...B.keys()].filter(id => H.has(id));
 const unmodeled = matched.filter(id => head.contracts[id] && modelGaps(head.contracts[id]).length).sort();
 const reach = new Set();
 for (const r of head.scan.routes) { reach.add(r.file); if (head.contracts[r.id]) for (const f of depDigest(r, head.contracts[r.id], head.fileFacts).files) reach.add(f); }
 for (const r of base.scan.routes) { reach.add(r.file); if (base.contracts[r.id]) for (const f of depDigest(r, base.contracts[r.id], base.fileFacts).files) reach.add(f); }
 const allFiles = [...new Set([...Object.keys(base.fileFacts), ...Object.keys(head.fileFacts)])].sort();
 const changedOutside = allFiles.filter(f => !reach.has(f) && base.fileFacts[f]?.astHash !== head.fileFacts[f]?.astHash);
 return {
  verdict, summary, findings,
  coverage: {
   routesCompared: matched.length,
   routesWithUnmodeledBehaviorInHead: unmodeled.length,
   changedFilesOutsideRouteEvidence: changedOutside,
   note: 'Routes with unmodeled behavior are flagged only when their code changed. Files outside route evidence are listed, not classified.',
  },
 };
}

export async function runDiff({ root, sources, base, head, baseMode = 'merge-base', limits } = {}) {
 if (!['merge-base', 'tip'].includes(baseMode)) throw new Error('Invalid base mode');
 const headCommit = resolveCommit(root, head);
 const baseTip = resolveCommit(root, base);
 const comparedBase = baseMode === 'tip' ? baseTip : mergeBase(root, baseTip, headCommit);
 const b = await analyzeRepository({ root, sources, revision: comparedBase, limits, withContracts: true });
 const h = await analyzeRepository({ root, sources, revision: headCommit, limits, withContracts: true });
 const result = classifyChanges(b, h);
 return seal({
  schemaVersion: DIFF_SCHEMA,
  toolVersion: '0.1.0-rc.1',
  preview: true,
  supportedSubset: b.scan.supportedSubset,
  ruleset: RULESET,
  scopes: h.scan.scopes,
  base: { ref: base, mode: baseMode, refCommit: baseTip, comparedCommit: comparedBase, scanFingerprint: b.scan.fingerprint, complete: b.scan.complete, routes: b.scan.routes.length },
  head: { ref: head, comparedCommit: headCommit, scanFingerprint: h.scan.fingerprint, complete: h.scan.complete, routes: h.scan.routes.length },
  ...result,
  exitCodes: EXIT_MEANING,
  warning: 'Preview. Static, Express-subset analysis of committed source only. Exit 0 means no breaking change or review item was found within the supported scope; it is NOT a compatibility guarantee. Runtime behavior, data, dependencies outside the scanned scopes and unsupported patterns are not covered.',
 });
}

const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_|[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
function describe(f) {
 const bits = [];
 if (f.headPath) bits.push(`→ ${esc(f.headPath)}`);
 if (f.target) bits.push(`${esc(f.target.in)} \`${esc(f.target.name)}\``);
 if (f.check) bits.push(`check ${esc(f.check)}`);
 if (f.status != null) bits.push(`status ${f.status}`);
 if (f.field) bits.push(`field \`${esc(f.field)}\``);
 if (f.before !== undefined || f.after !== undefined) bits.push(`${esc(JSON.stringify(f.before ?? null))} → ${esc(JSON.stringify(f.after ?? null))}`);
 if (f.count) bits.push(`${f.count} value(s)`);
 if (f.reasons) bits.push(`reasons: ${f.reasons.map(esc).join(', ')}`);
 if (f.constants) bits.push(`constants: ${f.constants.map(esc).join(', ')}`);
 if (f.files) bits.push(`files: ${f.files.map(esc).join(', ')}`);
 if (f.sides && f.code !== 'analysis-gap') bits.push(`side: ${f.sides.join('+')}`);
 if (f.notProvable) bits.push(`not provable: ${esc(f.notProvable)}`);
 return bits.join('; ');
}
function where(f) {
 if (f.code === 'analysis-gap') return `${esc(f.file ?? '(scan)')}${f.lines.head.length ? ':' + f.lines.head.join(',') : f.lines.base.length ? ':' + f.lines.base.join(',') + ' (base)' : ''} [${f.sides.join('+')}]`;
 const l = f.locations?.head ?? f.locations?.base;
 return l ? `${esc(l.file)}:${l.line}` : '';
}
export function diffMarkdown(report) {
 const title = { breaking: 'BREAKING — consumer-breaking change found', needs_review: 'NEEDS REVIEW — not statically provable', no_breaking_change_found_in_supported_scope: 'No breaking change found within the supported scope (not a compatibility guarantee)' }[report.verdict];
 const lines = ['# SpecGate consumer-break check (preview)', '', `**${title}**`, '',
  `Base \`${esc(report.base.ref)}\` (${report.base.mode}: ${report.base.comparedCommit.slice(0, 12)}) → head \`${esc(report.head.ref)}\` (${report.head.comparedCommit.slice(0, 12)}) · scopes: ${report.scopes.map(esc).join(', ')}`, '',
  `| breaking | needs review | non-breaking |`, `|---|---|---|`, `| ${report.summary.breaking} | ${report.summary.needs_review} | ${report.summary.non_breaking} |`, ''];
 for (const [cls, heading] of [['breaking', 'Breaking'], ['needs_review', 'Needs review'], ['non_breaking', 'Non-breaking']]) {
  const items = report.findings.filter(f => f.classification === cls);
  if (!items.length) continue;
  lines.push(`## ${heading}`, '');
  for (const f of items) {
   const route = f.method ? `${esc(f.method)} ${esc(f.path)} ` : '';
   const d = describe(f);
   lines.push(`- ${f.id} \`${esc(f.code)}\`${f.gap ? ` (${esc(f.gap)})` : ''} ${route}${d ? '— ' + d + ' ' : ''}— ${where(f)}`);
  }
  lines.push('');
 }
 lines.push('## Coverage', '', `- Routes compared: ${report.coverage.routesCompared}; with behavior outside the static model (head): ${report.coverage.routesWithUnmodeledBehaviorInHead}`);
 if (report.coverage.changedFilesOutsideRouteEvidence.length) lines.push(`- Changed files not linked to any route: ${report.coverage.changedFilesOutsideRouteEvidence.map(esc).join(', ')}`);
 lines.push('', `Exit codes: 0 = ${report.exitCodes[0]} 1 = ${report.exitCodes[1]} 2 = ${report.exitCodes[2]}`, '', report.warning, '', `Fingerprint: ${report.fingerprint}`, '');
 return lines.join('\n');
}
