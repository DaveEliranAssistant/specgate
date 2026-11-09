// Deterministic triage labels. This is the whole product when no model is configured.
export const LABELS = Object.freeze(['consumer_break', 'approved_change', 'noise', 'needs_review']);
const SEVERITY = { consumer_break: 3, needs_review: 2, approved_change: 1, noise: 0 };

export function validateIntent(doc) {
 if (doc == null) return null;
 if (doc.schemaVersion !== 'specgate.intent/1' || typeof doc.review?.reference !== 'string' || !doc.review.reference || !Array.isArray(doc.approved)) throw new Error('Invalid intent file');
 for (const a of doc.approved) {
  if (typeof a.routeId !== 'string' || !/^route\.[a-f0-9]{24}$/.test(a.routeId)) throw new Error('Invalid intent routeId');
  if (a.keys !== undefined && (!Array.isArray(a.keys) || !a.keys.every(k => typeof k === 'string'))) throw new Error('Invalid intent keys');
  if (typeof a.reference !== 'string' || !a.reference) throw new Error('Each approval needs a reference');
 }
 return doc;
}

function approvalFor(intent, routeId, keys) {
 const a = intent?.approved.find(x => x.routeId === routeId);
 if (!a) return null;
 if (a.keys && !keys.every(k => a.keys.includes(k))) return null;
 return a.reference;
}

function classifyRoute(item, intent) {
 const { finding: f, deltas } = item;
 if (f.code === 'route-removed') {
  const ref = approvalFor(intent, f.routeId, ['route-removed']);
  return ref ? ['approved_change', `Route removal approved by ${ref}`] : ['consumer_break', 'Route removed; existing clients of this route will fail'];
 }
 if (f.code === 'route-added') {
  const ref = approvalFor(intent, f.routeId, ['route-added']);
  return ref ? ['approved_change', `New route approved by ${ref}`] : ['needs_review', 'Additive route; not a break, but needs independent requirements before tests'];
 }
 const material = deltas.filter(d => d.direction !== 'cosmetic');
 if (!material.length) return ['noise', deltas.length ? 'Only handler name or registration location changed' : 'Observation reordered without semantic delta'];
 const ref = approvalFor(intent, f.routeId, material.map(d => d.key));
 if (ref) return ['approved_change', `Delta approved by ${ref}`];
 const tight = material.filter(d => d.direction === 'tightened');
 if (tight.length) return ['consumer_break', 'Stricter contract: ' + tight.map(d => d.key).join(', ')];
 return ['needs_review', 'Loosened or ambiguous change: ' + material.map(d => d.key).join(', ')];
}

export function classify(enriched, intent = null) {
 validateIntent(intent);
 const byId = new Map();
 const results = enriched.findings.map(item => {
  const f = item.finding;
  let label, reason, locked = false;
  if (f.code === 'analysis-gap') { label = 'needs_review'; reason = 'Parser could not analyze this statement; never auto-classified'; locked = true; }
  else if (f.code === 'source-changed') { label = null; reason = null; }
  else [label, reason] = classifyRoute(item, intent);
  const r = { id: item.id, code: f.code, routeId: f.routeId ?? item.route?.id ?? null, file: f.file ?? item.route?.file ?? null, label, reason, locked };
  byId.set(item.id, r); return r;
 });
 // source-changed: inherit the most severe label of route findings in that file; otherwise noise within the observed subset.
 for (const r of results) {
  if (r.code !== 'source-changed') continue;
  const related = results.filter(x => x !== r && x.file === r.file && x.label);
  if (!related.length) { r.label = 'noise'; r.reason = 'Source hash changed but no route-level delta was observed in the supported subset (comments/formatting/unobserved code). Still review if the file has unsupported code.'; continue; }
  const top = related.reduce((a, b) => SEVERITY[b.label] > SEVERITY[a.label] ? b : a);
  r.label = top.label; r.reason = 'Covered by route findings in the same file'; r.related = related.map(x => x.id);
 }
 return results;
}
