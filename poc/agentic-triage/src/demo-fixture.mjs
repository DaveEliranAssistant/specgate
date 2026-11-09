// Synthetic two-commit service used by tests and the demo. Not customer code. Test-owned temp repos only.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { scanRepository } from '../../../packages/specgate/src/scan.mjs';

const handler = (name, body) => `export function ${name}(req, res) {\n${body}\n}\n`;
const auth = ` const header = req.headers.authorization;\n if (header !== 'Bearer ' + TOKEN) { res.status(401).json({ error: 'unauthorized' }); return; }`;
function service({ titleMax = 80, healthName = 'health', keepDelete = true, audit = false, patchOptional = false }) {
 return [
  `import express from 'express';`, `export const app = express();`, `app.use(express.json());`, `const TOKEN = 'synthetic-demo-token';`,
  handler(healthName, ` res.status(200).json({ ok: true });`),
  handler('create', ` const title = req.body.title;\n if (typeof title !== 'string') { res.status(400).json({ error: 'title_type' }); return; }\n if (title.length < 1 || title.length > ${titleMax}) { res.status(400).json({ error: 'title_length' }); return; }\n res.status(201).json({ ok: true });`),
  handler('read', auth + `\n res.status(200).json({ ok: true });`),
  handler('update', auth + `\n const title = req.body.title;\n if (${patchOptional ? 'title !== undefined && ' : ''}typeof title !== 'string') { res.status(400).json({ error: 'title_type' }); return; }\n res.status(200).json({ ok: true });`),
  handler('remove', auth + `\n res.status(204).json({});`),
  audit ? handler('audit', ` res.status(200).json({ ok: true });`) : '',
  `app.get('/health', ${healthName});`, `app.post('/tickets', create);`, `app.get('/tickets/:id', read);`, `app.patch('/tickets/:id', update);`,
  keepDelete ? `app.delete('/tickets/:id', remove);` : '', audit ? `app.get('/audit', audit);` : '', '',
 ].join('\n');
}
const helpers = comment => `// ${comment}\nexport const PAGE_SIZE = 20;\n`;

export const SCENARIO = Object.freeze({ titleMax: 40, healthName: 'healthCheck', keepDelete: false, audit: true, patchOptional: true });

export async function buildDemo(change = SCENARIO, { root = mkdtempSync(join(tmpdir(), 'specgate-triage-')) } = {}) {
 const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
 const commit = msg => { git('add', '--all'); git('-c', 'user.name=SpecGate demo', '-c', 'user.email=demo@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--allow-empty', '-m', msg); };
 mkdirSync(join(root, 'src'), { recursive: true });
 git('init', '--quiet');
 writeFileSync(join(root, 'src/service.mjs'), service({}));
 writeFileSync(join(root, 'src/helpers.mjs'), helpers('Normalizes values.'));
 commit('baseline');
 const baseline = await scanRepository({ root, sources: ['src'] });
 writeFileSync(join(root, 'src/service.mjs'), service(change));
 writeFileSync(join(root, 'src/helpers.mjs'), helpers('Normalizes values. Comment-only edit.'));
 commit('change');
 const current = await scanRepository({ root, sources: ['src'] });
 return { root, baseline, current };
}
