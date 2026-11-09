#!/usr/bin/env node
// Optional triage on top of two SpecGate scan reports. Does not scan, does not write baselines, does not edit tests.
import { readFileSync, writeFileSync } from 'node:fs';
import { readJson } from '../../../packages/specgate/src/cli.mjs';
import { triage, toMarkdown, exitCodeFor } from '../src/triage.mjs';
import { PROVIDERS } from '../src/providers.mjs';

const HELP = `specgate-triage (POC, optional) --baseline TRUSTED_SCAN.json --current SCAN.json
  [--intent REVIEWED_INTENT.json] [--format json|markdown] [--output NEW_FILE]
  [--provider none|groq|gemini|cloudflare] [--send] [--include-identifiers] [--intent-text PR_DESCRIPTION.txt]
  [--show-payload]
Default provider is none: deterministic labels only, no network.
A provider without --send prints what WOULD be sent and makes no request.
Exit mirrors 'specgate check': 0 pass, 1 review required, 2 input/tool failure. Triage never changes it.
`;

export async function run(args) {
 try {
  if (args.includes('--help')) { process.stdout.write(HELP); return 0; }
  const flags = new Set(['--send', '--include-identifiers', '--show-payload']);
  const valued = new Set(['--baseline', '--current', '--intent', '--format', '--output', '--provider', '--intent-text']);
  const o = { format: 'json', provider: 'none' }, seen = new Set();
  for (let i = 0; i < args.length; i++) {
   const k = args[i];
   if (flags.has(k)) { o[k.slice(2)] = true; continue; }
   if (!valued.has(k) || typeof args[i + 1] !== 'string' || args[i + 1].startsWith('--') || seen.has(k)) throw new Error('args');
   seen.add(k);
   o[k.slice(2)] = args[++i];
  }
  if (!o.baseline || !o.current || !['json', 'markdown'].includes(o.format) || !(o.provider === 'none' || Object.hasOwn(PROVIDERS, o.provider))) throw new Error('args');
  if (o.send && o.provider === 'none') throw new Error('args');
  const intentText = o['intent-text'] ? readFileSync(o['intent-text'], 'utf8').slice(0, 20000) : null;
  const { report, payload } = await triage({
   baseline: readJson(o.baseline), current: readJson(o.current), intent: o.intent ? readJson(o.intent) : null,
   provider: o.provider, send: Boolean(o.send), includeIdentifiers: Boolean(o['include-identifiers']), intentText,
  });
  if (o['show-payload'] || (o.provider !== 'none' && !o.send)) process.stderr.write('Payload that ' + (o.send ? 'was' : 'WOULD be') + ' sent:\n' + JSON.stringify(payload, null, 2) + '\n');
  const out = o.format === 'markdown' ? toMarkdown(report) : JSON.stringify(report, null, 2) + '\n';
  if (o.output) writeFileSync(o.output, out, { flag: 'wx', mode: 0o600 }); else process.stdout.write(out);
  return exitCodeFor(report);
 } catch {
  process.stderr.write('specgate-triage: invalid arguments/input or unreadable file. Use --help; input contents and keys are never echoed.\n');
  return 2;
 }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('specgate-triage.mjs')) process.exitCode = await run(process.argv.slice(2));
