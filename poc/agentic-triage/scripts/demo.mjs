// Regenerates evidence/ from a synthetic temp repo. No network: the "model" run uses a SIMULATED response.
// Usage: node poc/agentic-triage/scripts/demo.mjs [--live groq|gemini|cloudflare]   (live needs keys + explicit flag)
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDemo } from '../src/demo-fixture.mjs';
import { triage, toMarkdown } from '../src/triage.mjs';

const out = name => fileURLToPath(new URL(`../evidence/${name}`, import.meta.url));
const { root, baseline, current } = await buildDemo();
try {
 const routeId = (m, p) => current.routes.concat(baseline.routes).find(r => r.method === m && r.path === p).id;
 const intent = { schemaVersion: 'specgate.intent/1', review: { reference: 'demo/CHANGELOG.md#v2' }, approved: [{ routeId: routeId('DELETE', '/tickets/:id'), reference: 'demo/CHANGELOG.md#remove-delete' }] };
 const intentText = 'v2: remove DELETE /tickets/:id (use PATCH status=closed instead). Make PATCH title optional. Add /audit. Token: sk-demo1234567890abcdef (must be redacted).';

 const none = await triage({ baseline, current });
 writeFileSync(out('1-no-model.md'), toMarkdown(none.report));
 const approved = await triage({ baseline, current, intent });
 writeFileSync(out('2-reviewed-intent-no-model.md'), toMarkdown(approved.report));
 const dry = await triage({ baseline, current, intent, provider: 'groq', intentText });
 writeFileSync(out('3-dry-run-payload.json'), JSON.stringify(dry.payload, null, 2) + '\n');

 // SIMULATED free-tier reply, including one disagreement and two invalid entries the validator must drop.
 const simulated = JSON.stringify({ suggestions: [
  { id: 'f1', label: 'consumer_break', rationale: 'Max length shrank; clients sending 41-80 chars now get 400.' },
  { id: 'f3', label: 'approved_change', rationale: 'Change intent says PATCH title becomes optional.' },
  { id: 'f4', label: 'noise', rationale: 'Handler rename and line move only.' },
  { id: 'f6', label: 'approved_change', rationale: 'Intent mentions adding /audit.' },
  { id: 'f8', label: 'noise', rationale: 'Wrong on purpose: model tries to downgrade a break.' },
  { id: 'f99', label: 'noise', rationale: 'Unknown id: dropped.' },
  { id: 'f2', label: 'rewrite_assertion', rationale: 'Invalid label: dropped.', patch: 'expect(200)' },
 ] });
 const fakeFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: simulated } }] }), { status: 200 });
 const sim = await triage({ baseline, current, intent, provider: 'groq', send: true, intentText, env: { GROQ_API_KEY: 'simulated-not-a-key' }, fetchImpl: fakeFetch });
 sim.report.model.provider = 'groq (SIMULATED response, no network)';
 writeFileSync(out('4-simulated-model.md'), toMarkdown(sim.report));
 const down = await triage({ baseline, current, intent, provider: 'gemini', send: true, env: { GEMINI_API_KEY: 'simulated' }, fetchImpl: async () => new Response('{}', { status: 429 }) });
 writeFileSync(out('5-free-tier-rate-limited.md'), toMarkdown(down.report));

 const live = process.argv.indexOf('--live');
 if (live > 0) {
  const r = await triage({ baseline, current, intent, provider: process.argv[live + 1], send: true, intentText });
  writeFileSync(out(`6-live-${process.argv[live + 1]}.md`), toMarkdown(r.report));
 }
 process.stdout.write('Evidence written to poc/agentic-triage/evidence/\n');
} finally { rmSync(root, { recursive: true, force: true }); }
