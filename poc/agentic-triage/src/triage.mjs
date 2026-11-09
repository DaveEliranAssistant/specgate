import { enrichCheck } from './delta.mjs';
import { classify, LABELS } from './rules.mjs';
import { buildPayload } from './payload.mjs';
import { callProvider } from './providers.mjs';

// Strictly validates model output. Unknown ids, labels or extra keys are dropped; nothing is executed or applied.
export function parseSuggestions(text, allowedIds) {
 let doc;
 try { doc = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return { suggestions: [], rejected: 1 }; }
 const list = Array.isArray(doc?.suggestions) ? doc.suggestions : [];
 const seen = new Set(), suggestions = []; let rejected = Array.isArray(doc?.suggestions) ? 0 : 1;
 for (const s of list) {
  if (!s || !allowedIds.has(s.id) || seen.has(s.id) || !LABELS.includes(s.label)) { rejected++; continue; }
  seen.add(s.id);
  const rationale = typeof s.rationale === 'string' ? s.rationale.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) : '';
  suggestions.push({ id: s.id, label: s.label, rationale });
 }
 return { suggestions, rejected };
}

export async function triage({ baseline, current, intent = null, provider = 'none', send = false, includeIdentifiers = false, intentText = null, env, fetchImpl, model } = {}) {
 const enriched = enrichCheck(baseline, current);
 const labels = classify(enriched, intent);
 const payload = buildPayload(enriched, labels, { includeIdentifiers, intentText });
 const report = {
  schemaVersion: 'specgate.triage/1',
  advisoryOnly: true,
  check: { passed: enriched.check.passed, previousFingerprint: enriched.check.previousFingerprint, currentFingerprint: enriched.check.currentFingerprint, findingCount: enriched.check.findings.length },
  findings: labels.map(l => { const e = enriched.findings.find(x => x.id === l.id); return { ...l, route: e.route ? `${e.route.method} ${e.route.path}` : null, deltas: e.deltas }; }),
  model: { provider, status: 'not-configured' },
  warning: 'Labels are review aids, not approvals. The check result above is unchanged by triage; no baseline, test or assertion is modified.',
 };
 if (provider === 'none') return { report, payload };
 if (!send) { report.model.status = 'dry-run-payload-only'; return { report, payload }; }
 if (!payload.findings.length) { report.model.status = 'nothing-to-send'; return { report, payload }; }
 const res = await callProvider(provider, payload, { env, fetchImpl, model });
 if (!res.ok) { report.model.status = 'unavailable'; report.model.error = res.error; return { report, payload }; }
 const { suggestions, rejected } = parseSuggestions(res.text, new Set(payload.findings.map(f => f.id)));
 report.model.status = 'suggested'; report.model.rejectedSuggestions = rejected;
 for (const s of suggestions) {
  const f = report.findings.find(x => x.id === s.id);
  f.modelSuggestion = { label: s.label, rationale: s.rationale, agreesWithRules: s.label === f.label };
 }
 return { report, payload };
}

export function exitCodeFor(report) { return report.check.passed ? 0 : 1; }

const esc = s => String(s ?? '').replace(/[\\`*_|\[\]<>]/g, '\\$&').replace(/[\r\n]/g, ' ');
export function toMarkdown(report) {
 const lines = ['# SpecGate triage (optional, advisory)', '', report.check.passed ? 'Check: PASS' : 'Check: REVIEW REQUIRED (unchanged by triage)', '', `Model: ${esc(report.model.provider)} — ${esc(report.model.status)}${report.model.error ? ' (' + esc(report.model.error) + ')' : ''}${report.model.rejectedSuggestions ? `; ${report.model.rejectedSuggestions} invalid suggestion(s) dropped` : ''}`, '', '| id | finding | rules label | reason | model suggestion |', '|---|---|---|---|---|'];
 for (const f of report.findings) {
  const m = f.modelSuggestion ? `${esc(f.modelSuggestion.label)}${f.modelSuggestion.agreesWithRules ? '' : ' ⚠ disagrees'} — ${esc(f.modelSuggestion.rationale)}` : (f.locked ? 'not sent (locked)' : '—');
  lines.push(`| ${f.id} | ${esc(f.code)} ${esc(f.route ?? f.file ?? '')} | ${esc(f.label)} | ${esc(f.reason)} | ${m} |`);
 }
 lines.push('', report.warning, '');
 return lines.join('\n');
}
