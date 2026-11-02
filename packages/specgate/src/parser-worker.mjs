import { parentPort, workerData } from 'node:worker_threads';
import { extname } from 'node:path';
import { discoverSource } from './engine/discover.mjs';
import { createHash } from 'node:crypto';

try {
 const routes = [], gaps = [], keys = new Set();
 for (const file of workerData) {
  if (['.ts', '.tsx', '.jsx', '.cjs'].includes(extname(file.path))) { gaps.push({ file: file.path, line: null, code: 'unsupported-language' }); continue; }
  const d = discoverSource(file.path, file.source);
  for (const u of d.unsupported) gaps.push({ file: file.path, line: u.line, code: u.pattern });
  const expressBound = d.imports.some(i => i.module === 'express' && i.names.some(n => n.imported === 'default' && n.local === 'express')) && d.setups.some(s => s.kind === 'express-app');
  if (d.routes.length && !expressBound) gaps.push({ file: file.path, line: null, code: 'unverified-express-binding' });
  for (const r of d.routes) {
   const key = `${r.method} ${r.path}`;
   if (keys.has(key)) gaps.push({ file: file.path, line: r.registration.line, code: 'duplicate-route' });
   keys.add(key);
   if (!r.handlerLocation || r.auth === null) gaps.push({ file: file.path, line: r.registration.line, code: 'unresolved-handler-or-middleware' });
   const types = ['string','number','boolean','undefined','object','symbol','bigint','function'];
   for (const v of r.validation) if (v.expectedType && !types.includes(v.expectedType)) gaps.push({ file: file.path, line: v.line, code: 'unsupported-expected-type' });
   const validation = r.validation.map(v => Object.fromEntries(['kind', 'field', 'expectedType', 'minLength', 'maxLength', 'optional'].filter(k => v[k] !== undefined && (k !== 'expectedType' || types.includes(v[k]))).map(k => [k, v[k]])));
   routes.push({ id: 'route.' + createHash('sha256').update(key).digest('hex').slice(0, 24), method: r.method, path: r.path, file: file.path, line: r.registration.line, handler: r.handler, auth: !expressBound || r.auth === null ? 'unknown' : r.auth ? 'gate_observed' : 'not_observed', validation, responseStatuses: r.terminalResponses.map(r => r.status).sort((a,b) => a-b) });
  }
 }
 if (!routes.length) gaps.push({ file: null, line: null, code: 'no-routes' });
 routes.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
 parentPort.postMessage({ routes, gaps, complete: gaps.length === 0 });
} catch { parentPort.postMessage({ error: true }); }
