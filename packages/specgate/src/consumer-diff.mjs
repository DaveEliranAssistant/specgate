import { canonical, seal, scanRepository } from './scan.mjs';
import { validateScan } from './gate.mjs';
import { resolveGitRef } from './git-source.mjs';
const shape = path => path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':');
const params = path => path.split('/').filter(p => p.startsWith(':'));
const sorted = values => [...values].sort((a,b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
export function compareConsumerScans(base, head) {
 validateScan(base); validateScan(head);
 if (canonical(base.scopes) !== canonical(head.scopes)) throw new Error('Source scopes differ');
 const findings=[];
 const add=(code,classification,route,details={})=>findings.push({code,classification,method:route.method,path:route.path,...details});
 for (const [side,scan] of [['base',base],['head',head]]) {
  for (const gap of scan.gaps) findings.push({code:'analysis-gap',classification:'needs_review',side,file:gap.file,line:gap.line,reason:gap.code});
  for (const r of scan.routes) if (!r.consumer || r.consumer.opaque) add('analysis-gap','needs_review',r,{side,reason:'opaque-response-dependency-or-middleware'});
 }
 const matched=new Set();
 for (const old of base.routes) {
  let next=head.routes.find(r=>r.method===old.method && r.path===old.path);
  if (!next) {
   const candidates=head.routes.filter(r=>r.method===old.method && shape(r.path)===shape(old.path));
   if(candidates.length===1) {next=candidates[0];add('path-param-renamed','breaking',old,{headPath:next.path});}
  }
  if (!next) {
   const addedParam=head.routes.filter(r=>r.method===old.method && r.path.startsWith(old.path+'/:'));
   if(addedParam.length===1 && params(addedParam[0].path).length>params(old.path).length) add('path-param-added','breaking',old,{headPath:addedParam[0].path});
   add(head.routes.some(r=>r.path===old.path)?'method-removed':'route-removed','breaking',old);
   continue;
  }
  matched.add(next.id);
  if(old.auth!==next.auth) add('authentication-observation-changed','needs_review',next);
  const required=r=>r.validation.filter(v=>v.field && !v.optional && v.kind==='type' && v.expectedType!=='undefined');
  for(const v of required(next)) if(!required(old).some(p=>p.field===v.field)) add('required-request-field-added','breaking',next,{field:v.field});
  // Constraints outside the required-field rule remain reviewable, never silently safe.
  const normalize=r=>sorted(r.validation);
  if(canonical(normalize(old))!==canonical(normalize(next))) add('request-validation-changed','needs_review',next);
  if(canonical(old.responseStatuses)!==canonical(next.responseStatuses)) add('status-codes-changed','breaking',next,{before:old.responseStatuses,after:next.responseStatuses});
  if(old.consumer && next.consumer) {
   for(const response of old.consumer.responses) {
    const after=next.consumer.responses.find(r=>r.status===response.status);
    if(!response.fields || !after?.fields) continue;
    for(const [field,type] of Object.entries(response.fields)) {
     if(!(field in after.fields)) add('response-field-removed','breaking',next,{status:response.status,field});
     else if(after.fields[field]!==type) add('response-field-type-changed','breaking',next,{status:response.status,field,before:type,after:after.fields[field]});
    }
    for(const field of Object.keys(after.fields)) if(!(field in response.fields)) add('response-field-added','non_breaking',next,{status:response.status,field});
   }
  }
 }
 for(const r of head.routes) if(!matched.has(r.id) && !base.routes.some(old=>old.id===r.id)) add('route-added','non_breaking',r);
 const ordered=sorted(findings);
 return seal({schemaVersion:'specgate.consumer-diff/1',preview:true,baseCommit:base.sourceCommit,headCommit:head.sourceCommit,baseFingerprint:base.fingerprint,headFingerprint:head.fingerprint,scopes:base.scopes,passed:!ordered.some(f=>f.classification!=='non_breaking'),findings:ordered,warning:'Preview: exit 0 means no breaking change found within the supported static scope. It is NOT a compatibility guarantee. Dependencies, runtime behavior, excluded files and consumer expectations are not proven.'});
}
export async function diffRepository({root='.',sources,base,head}) {
 const baseCommit=resolveGitRef(root,base),headCommit=resolveGitRef(root,head);
 const previous=await scanRepository({root,sources,revision:baseCommit});
 const current=await scanRepository({root,sources,revision:headCommit});
 return compareConsumerScans(previous,current);
}
