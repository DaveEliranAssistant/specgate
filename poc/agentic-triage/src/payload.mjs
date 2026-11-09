// Builds the ONLY data that may leave the machine for an optional model call.
// Allowlist construction: nothing is copied from the scan unless named here.
// Never included: source text, file paths, hashes, commit SHAs, fingerprints, logs, HTML, env values.
const MAX_INTENT = 1500;
const SECRETISH = [
 /\b(?:sk|pk|rk|gsk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|ASIA|AIza)[A-Za-z0-9_\-]{8,}/g,
 /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi,
 /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}/g, // JWT
 /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g,
 /\b[A-Fa-f0-9]{32,}\b/g,
 /\b[A-Za-z0-9+/]{40,}={0,2}/g,
 /\bhttps?:\/\/\S+/gi,
 /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
 /<[^>]{1,200}>/g, // HTML-ish tags
];

export function scrubIntent(text) {
 if (typeof text !== 'string') return null;
 let t = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ');
 for (const re of SECRETISH) t = t.replace(re, '[redacted]');
 return t.slice(0, MAX_INTENT);
}

export function buildPayload(enriched, labels, { includeIdentifiers = false, intentText = null } = {}) {
 const routeRefs = new Map(), fieldRefs = new Map();
 const ref = (map, prefix, key) => { if (key == null) return null; if (!map.has(key)) map.set(key, `${prefix}#${map.size + 1}`); return map.get(key); };
 const routeName = r => includeIdentifiers ? `${r.method} ${r.path}` : `${r.method} ${ref(routeRefs, 'route', r.id)}`;
 const fieldName = f => f == null ? null : includeIdentifiers ? f : ref(fieldRefs, 'field', f);
 const labelOf = new Map(labels.map(l => [l.id, l]));
 const findings = [];
 for (const item of enriched.findings) {
  const l = labelOf.get(item.id);
  if (l.locked) continue; // analysis gaps are never sent or reclassified
  const scalar = v => (typeof v === 'number' || typeof v === 'boolean' || v === null || ['present', 'absent', 'moved', 'renamed', 'gate_observed', 'not_observed', 'unknown', 'string', 'number', 'boolean', 'object', 'undefined'].includes(v)) ? v : '[omitted]';
  findings.push({
   id: item.id,
   code: item.finding.code,
   route: item.route ? routeName(item.route) : null,
   deltas: item.deltas.map(d => ({ key: d.key, field: fieldName(d.field), before: scalar(d.before), after: scalar(d.after), direction: d.direction })),
   rulesLabel: l.label,
  });
 }
 const payload = { schema: 'specgate.triage-request/1', labels: ['consumer_break', 'approved_change', 'noise', 'needs_review'], findings };
 if (intentText != null) payload.changeIntent = scrubIntent(intentText);
 return payload;
}

export const SYSTEM_PROMPT = `You triage API change findings from a static scanner. For each finding, choose one label:
consumer_break (existing API clients would now fail), approved_change (the stated change intent clearly covers it),
noise (no client-visible effect), needs_review (cannot tell). Prefer needs_review when unsure. Do not propose code,
test or assertion edits. Reply with JSON only: {"suggestions":[{"id":"f1","label":"...","rationale":"<= 200 chars"}]}`;
