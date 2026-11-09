// Deterministic, field-level deltas between two validated SpecGate scans.
// No model, no network. This is the evidence every later step is built on.
import { validateScan, compareScans } from '../../../packages/specgate/src/gate.mjs';

const vKey = v => `${v.kind}:${v.field ?? ''}`;

// Each delta: { key, field?, before, after, direction }
// direction: 'tightened' | 'loosened' | 'changed' | 'cosmetic'
export function routeDeltas(before, after) {
 const out = [];
 if (before.auth !== after.auth) {
  const dir = after.auth === 'gate_observed' ? 'tightened' : before.auth === 'gate_observed' ? 'loosened' : 'changed';
  out.push({ key: 'auth', before: before.auth, after: after.auth, direction: dir });
 }
 const oldV = new Map(before.validation.map(v => [vKey(v), v])), newV = new Map(after.validation.map(v => [vKey(v), v]));
 for (const [k, v] of oldV) {
  const n = newV.get(k);
  if (!n) { out.push({ key: `validation.${v.kind}`, field: v.field ?? null, before: 'present', after: 'absent', direction: 'loosened' }); continue; }
  if (v.minLength !== n.minLength) out.push({ key: 'validation.length.minLength', field: v.field, before: v.minLength ?? null, after: n.minLength ?? null, direction: (n.minLength ?? 0) > (v.minLength ?? 0) ? 'tightened' : 'loosened' });
  if (v.maxLength !== n.maxLength) out.push({ key: 'validation.length.maxLength', field: v.field, before: v.maxLength ?? null, after: n.maxLength ?? null, direction: (n.maxLength ?? Infinity) < (v.maxLength ?? Infinity) ? 'tightened' : 'loosened' });
  if (v.expectedType !== n.expectedType) out.push({ key: 'validation.type.expectedType', field: v.field, before: v.expectedType ?? null, after: n.expectedType ?? null, direction: 'changed' });
  if (Boolean(v.optional) !== Boolean(n.optional)) out.push({ key: 'validation.optional', field: v.field, before: Boolean(v.optional), after: Boolean(n.optional), direction: n.optional ? 'loosened' : 'tightened' });
 }
 for (const [k, v] of newV) if (!oldV.has(k)) out.push({ key: `validation.${v.kind}`, field: v.field ?? null, before: 'absent', after: 'present', direction: v.optional ? 'changed' : 'tightened' });
 const oldS = new Set(before.responseStatuses), newS = new Set(after.responseStatuses);
 for (const s of oldS) if (!newS.has(s)) out.push({ key: 'responseStatus', before: s, after: 'absent', direction: 'tightened' });
 for (const s of newS) if (!oldS.has(s)) out.push({ key: 'responseStatus', before: 'absent', after: s, direction: 'changed' });
 if (before.handler !== after.handler) out.push({ key: 'handler', before: 'renamed', after: 'renamed', direction: 'cosmetic' });
 if (before.line !== after.line || before.file !== after.file) out.push({ key: 'location', before: 'moved', after: 'moved', direction: 'cosmetic' });
 return out;
}

// Runs the unchanged core check, then attaches deltas. The check result is returned verbatim.
export function enrichCheck(baseline, current) {
 const check = compareScans(baseline, current); // throws on invalid/unaccepted baseline, like the CLI
 validateScan(current);
 const oldR = new Map(baseline.routes.map(r => [r.id, r])), newR = new Map(current.routes.map(r => [r.id, r]));
 const findings = check.findings.map((f, i) => {
  const id = `f${i + 1}`;
  if (f.code === 'route-observation-changed') return { id, finding: f, route: newR.get(f.routeId), deltas: routeDeltas(oldR.get(f.routeId), newR.get(f.routeId)) };
  if (f.code === 'route-removed') return { id, finding: f, route: oldR.get(f.routeId), deltas: [] };
  if (f.code === 'route-added') return { id, finding: f, route: newR.get(f.routeId), deltas: [] };
  return { id, finding: f, route: null, deltas: [] };
 });
 return { check, findings };
}
