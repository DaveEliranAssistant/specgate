import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';

// Node prints an ExperimentalWarning the first time TypeScript types are
// stripped. Scanned source is never echoed; keep stderr quiet as well.
process.removeAllListeners('warning');
process.on('warning', () => {});

const { analyzeProject } = await import('./engine/project.mjs');

// workerData is either the file list (scan) or { files, withContracts } (diff).
const input = Array.isArray(workerData) ? { files: workerData, withContracts: false } : workerData;
const TYPES = ['string', 'number', 'boolean', 'undefined', 'object', 'symbol', 'bigint', 'function'];
try {
 const project = analyzeProject(input.files);
 const routes = [], keys = new Set(), contracts = {};
 const gaps = project.gaps.map(g => ({ ...g }));
 for (const r of project.routes) {
  const key = `${r.method} ${r.path}`;
  if (keys.has(key)) gaps.push({ file: r.file, line: r.line, code: 'duplicate-route', scope: 'inventory', evidence: hashOf(['duplicate', key]) });
  keys.add(key);
  if (r.auth === null && !gaps.some(g => g.scope === 'contract' && g.file === r.file && g.line === r.line)) {
   // Ensure every route whose chain is not fully resolved is visible as a gap.
   gaps.push({ file: r.file, line: r.line, code: 'unresolved-handler-or-middleware', scope: 'contract', evidence: r.contract.evidence });
  }
  for (const v of r.validation) if (v.expectedType && !TYPES.includes(v.expectedType)) gaps.push({ file: v.file ?? r.file, line: v.line, code: 'unsupported-expected-type', scope: 'contract', evidence: r.contract.evidence });
  const validation = r.validation.map(v => Object.fromEntries(['kind', 'field', 'expectedType', 'minLength', 'maxLength', 'optional'].filter(k => v[k] !== undefined && (k !== 'expectedType' || TYPES.includes(v[k]))).map(k => [k, v[k]])));
  const id = 'route.' + createHash('sha256').update(key).digest('hex').slice(0, 24);
  if (input.withContracts && !contracts[id]) contracts[id] = r.contract;
  const route = {
   id, method: r.method, path: r.path, file: r.file, line: r.line, handler: r.handler,
   auth: !r.verified || r.auth === null ? 'unknown' : r.auth ? 'gate_observed' : 'not_observed',
   validation,
   responseStatuses: r.terminalResponses.map(x => x.status).sort((a, b) => a - b),
   middleware: r.middleware,
  };
  if (r.handlerFile && r.handlerFile !== r.file) route.handlerFile = r.handlerFile;
  if (r.conditional) route.conditional = true;
  routes.push(route);
 }
 if (!routes.length) gaps.push({ file: null, line: null, code: 'no-routes', scope: 'inventory', evidence: hashOf(['no-routes']) });
 routes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.line - b.line || (a.file < b.file ? -1 : 1));
 gaps.sort((a, b) => (a.file ?? '') < (b.file ?? '') ? -1 : (a.file ?? '') > (b.file ?? '') ? 1 : (a.line ?? 0) - (b.line ?? 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
 const scan = { routes, gaps, complete: gaps.length === 0 };
 parentPort.postMessage(input.withContracts ? { scan, contracts, fileFacts: project.fileFacts } : scan);
} catch (error) {
 parentPort.postMessage({ error: true, detail: process.env.SPECGATE_DEBUG ? String(error?.stack ?? error) : undefined });
}

function hashOf(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
