import { canonical, hash } from './scan.mjs';
const HEX = /^[a-f0-9]{64}$/;
export function validateScan(doc, { accepted = false } = {}) {
 if (!doc || doc.schemaVersion !== 'specgate.scan/1' || doc.toolVersion !== '0.1.0-rc.1' || doc.supportedSubset !== 'express-literal-routes-v1' || !Array.isArray(doc.scopes) || !doc.scopes.length || !doc.scopes.every(s => typeof s === 'string') || !Array.isArray(doc.files) || !Array.isArray(doc.routes) || !Array.isArray(doc.gaps) || typeof doc.complete !== 'boolean') throw new Error('Invalid scan schema');
 const { fingerprint, ...payload } = doc;
 if (!HEX.test(fingerprint) || hash(canonical(payload)) !== fingerprint) throw new Error('Scan integrity check failed');
 if (doc.complete !== (doc.gaps.length === 0 && doc.routes.length > 0)) throw new Error('Inconsistent scan completeness');
 if (accepted && !doc.complete) throw new Error('Accepted baseline must have complete declared-subset analysis');
 const files = new Set(), routes = new Set();
 for (const f of doc.files) {
  if (typeof f.path !== 'string' || !f.path || !HEX.test(f.sha256) || files.has(f.path)) throw new Error('Invalid scan files');
  files.add(f.path);
 }
 for (const r of doc.routes) {
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(r.method) || typeof r.path !== 'string' || !r.path.startsWith('/') || typeof r.file !== 'string' || !files.has(r.file) || r.id !== 'route.' + hash(`${r.method} ${r.path}`).slice(0,24) || !Number.isInteger(r.line) || r.line < 1) throw new Error('Invalid scan route');
  if (routes.has(r.id) && doc.complete) throw new Error('Duplicate scan route');
  routes.add(r.id);
 }
 return doc;
}
export function compareScans(previous, current) {
 validateScan(previous, { accepted: true }); validateScan(current);
 if (canonical(previous.scopes) !== canonical(current.scopes)) throw new Error('Baseline source scopes differ');
 const findings = [], oldRoutes = new Map(previous.routes.map(r=>[r.id,r])), newRoutes = new Map(current.routes.map(r=>[r.id,r]));
 for (const [id,r] of oldRoutes) {
  if (!newRoutes.has(id)) findings.push({ code:'route-removed', routeId:id, method:r.method, path:r.path, action:'review_regression_or_explicit_requirement_change' });
  else if (canonical(r) !== canonical(newRoutes.get(id))) findings.push({code:'route-observation-changed',routeId:id,action:'review_no_assertions_changed'});
 }
 for (const [id] of newRoutes) if (!oldRoutes.has(id)) findings.push({code:'route-added',routeId:id,action:'review_and_add_independent_requirements'});
 const oldFiles = new Map(previous.files.map(f=>[f.path,f.sha256])), newFiles = new Map(current.files.map(f=>[f.path,f.sha256]));
 for (const path of [...new Set([...oldFiles.keys(),...newFiles.keys()])].sort()) if (oldFiles.get(path)!==newFiles.get(path)) findings.push({code:'source-changed',file:path,action:'review_and_run_impacted_tests'});
 for (const gap of current.gaps) findings.push({code:'analysis-gap',file:gap.file,line:gap.line,reason:gap.code,action:'manual_review_required'});
 return {schemaVersion:'specgate.check/1',passed:current.complete && !findings.length,previousFingerprint:previous.fingerprint,currentFingerprint:current.fingerprint,findings,warning:'Changed code requires review, not automatic baseline acceptance. No behavioral or security compatibility guarantee.'};
}
