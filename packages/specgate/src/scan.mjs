import { lstatSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { loadGitSources } from './git-source.mjs';

export const DEFAULT_LIMITS = Object.freeze({ maxFiles: 2000, maxFileBytes: 1048576, maxTotalBytes: 20971520, maxEntries: 10000, timeoutMs: 10000, acquisitionTimeoutMs: 30000 });
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
export const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
 if (Array.isArray(value)) return value.map(sort);
 if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])]));
 return value;
}
export function seal(report) { return { ...report, fingerprint: hash(canonical(report)) }; }
export async function scanRepository(options = {}) {
 return (await analyzeRepository(options)).scan;
}
// Shared by `scan` and `diff`. With withContracts, also returns per-route contract
// facts and per-file facts; the sealed scan itself is identical either way.
export async function analyzeRepository({ root, sources, revision = 'HEAD', limits: requested = {}, withContracts = false } = {}) {
 if (!Array.isArray(sources) || sources.length === 0 || sources.length > 100) throw new Error('Explicit source scopes are required (maximum 100)');
 const limits = { ...DEFAULT_LIMITS, ...requested };
 for (const [name, value] of Object.entries(limits)) if (!(name in DEFAULT_LIMITS) || !Number.isInteger(value) || value < 1 || value > DEFAULT_LIMITS[name]) throw new Error('Invalid resource limit');
 const base = resolve(root ?? '.');
 if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink()) throw new Error('Repository root must be a real directory');
 const scopes = [...new Set(sources)].sort();
 for (const scope of scopes) if (typeof scope !== 'string' || !scope || isAbsolute(scope) || scope.includes('\\') || scope.split('/').some(s => s === '..' || SKIP.has(s)) || /[\u0000-\u001f\u007f]/.test(scope)) throw new Error('Unsafe source scope');
 const { files, sourceCommit } = loadGitSources(base, scopes, revision, limits);
 const result = await new Promise((resolveResult, reject) => {
  const worker = new Worker(new URL('./parser-worker.mjs', import.meta.url), { workerData: withContracts ? { files, withContracts: true } : files, resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 }, execArgv: [] });
  const timer = setTimeout(() => { worker.terminate(); reject(new Error('Parser time limit exceeded')); }, limits.timeoutMs);
  worker.once('message', message => { clearTimeout(timer); worker.terminate(); message.error ? reject(new Error('Parser failed safely' + (message.detail ? ': ' + message.detail : ''))) : resolveResult(message); });
  worker.once('error', () => { clearTimeout(timer); reject(new Error('Parser resource limit or internal failure')); });
  worker.once('exit', () => { clearTimeout(timer); reject(new Error('Parser stopped before completion')); });
 });
 const scanResult = withContracts ? result.scan : result;
 const scan = seal({ schemaVersion: 'specgate.scan/1', toolVersion: '0.1.0-rc.1', supportedSubset: 'express-literal-routes-v1', inputMode: 'git-revision', sourceCommit, scopes, files: files.map(f => ({ path: f.path, sha256: hash(f.source) })), ...scanResult, warning: 'Committed source only. Static observations, not correctness assertions or a security audit. Complete means only the declared parser subset; excluded dependencies and unscanned files are not covered.' });
 return withContracts ? { scan, contracts: result.contracts, fileFacts: result.fileFacts } : { scan };
}
