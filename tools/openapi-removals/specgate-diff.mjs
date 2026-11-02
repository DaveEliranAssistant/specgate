/**
 * SG-02: deterministic, presence-only base -> current OpenAPI JSON removal POC.
 * Two rules only; every report requires manual review, including zero findings.
 * Native JSON.parse uses last-key-wins (duplicate keys are NOT detected).
 * Per string: 1,048,576 UTF-8 bytes; container depth 64 inclusive, root=0.
 * Limits apply after caller string allocation; depth is checked after parsing.
 * No reference resolution, I/O, logging, persistence, model calls or shared results.
 * A breaking finding is declared presence removal, NOT observed consumer impact.
 */
const methods = new Set(['get','put','post','delete','options','head','patch','trace']);
const constructs = new Set(['allOf','anyOf','oneOf','not','discriminator','additionalProperties']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value,key) => Object.hasOwn(value,key);
const token = key => key.replaceAll('~','~0').replaceAll('/','~1');
const flagged = key => key === '$ref' || constructs.has(key);
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;

function inspect(text) {
  let byteLength = null, version = null;
  const fail = code => ({file:{status:'invalid',byteLength,version,diagnostics:[{code,pointer:''}]},document:null});
  if(typeof text !== 'string')return fail('E_INPUT_TYPE');
  byteLength = new TextEncoder().encode(text).byteLength;
  if(byteLength > 1048576)return fail('E_INPUT_TOO_LARGE');
  if(text.trim() === '')return fail('E_EMPTY_INPUT');
  let document;
  try { document = JSON.parse(text); }
  catch(error) { if(error instanceof SyntaxError)return fail('E_INVALID_JSON');throw error; }
  if(!object(document))return fail('E_ROOT_OBJECT');
  version = own(document,'openapi') && typeof document.openapi === 'string' ? document.openapi : null;
  const depths = [{value:document,depth:0}];
  while(depths.length) {
    const {value,depth} = depths.pop();
    for(const child of Object.values(value)) {
      if(child !== null && typeof child === 'object') {
        if(depth === 64)return fail('E_MAX_DEPTH');
        depths.push({value:child,depth:depth+1});
      }
    }
  }
  const diagnostics = [], seen = new Set();
  const add = (code,pointer) => {
    const identity = JSON.stringify([code,pointer]);
    if(!seen.has(identity)){seen.add(identity);diagnostics.push({code,pointer});}
  };
  // All objects are scanned, even inside otherwise unassessed content and arrays.
  const stack = [{value:document,pointer:''}];
  while(stack.length) {
    const {value,pointer} = stack.pop();
    for(const [key,child] of Object.entries(value)) {
      const location = pointer+'/'+token(key);
      if(!Array.isArray(value)) {
        if(key === '$ref')add(typeof child === 'string' ? 'U_REF' : 'E_REF_TYPE',location);
        if(constructs.has(key))add('U_CONSTRUCT',location);
      }
      if(child !== null && typeof child === 'object')stack.push({value:child,pointer:location});
    }
  }
  for(const key of Object.keys(document))
    if(!['openapi','info','paths'].includes(key) && !flagged(key))add('U_FIELD','/'+token(key));
  if(!own(document,'openapi'))add('E_VERSION_REQUIRED','/openapi');
  else if(version === null)add('E_VERSION_TYPE','/openapi');
  else if(!/^3[.]0[.][0-9]+$/.test(version))add('U_VERSION','/openapi');
  if(!own(document,'info'))add('E_INFO_REQUIRED','/info');
  else if(!object(document.info))add('E_INFO_OBJECT','/info');
  else {
    for(const key of Object.keys(document.info))
      if(!['title','version','description'].includes(key) && !flagged(key))add('U_FIELD','/info/'+token(key));
    for(const key of ['title','version']) {
      if(!own(document.info,key) || typeof document.info[key] !== 'string' || !document.info[key].trim())
        add(key === 'title' ? 'E_INFO_TITLE' : 'E_INFO_VERSION','/info/'+key);
    }
    if(own(document.info,'description') && typeof document.info.description !== 'string')add('E_INFO_DESCRIPTION','/info/description');
  }
  if(!own(document,'paths'))add('E_PATHS_REQUIRED','/paths');
  else if(!object(document.paths))add('E_PATHS_OBJECT','/paths');
  else for(const [path,item] of Object.entries(document.paths)) {
    const pointer = '/paths/'+token(path);
    if(path.startsWith('x-'))add('U_FIELD',pointer);
    else if(!path.startsWith('/'))add('E_PATH_KEY',pointer);
    else if(!object(item))add('E_PATH_ITEM_OBJECT',pointer);
    else for(const [key,value] of Object.entries(item)) {
      const location = pointer+'/'+token(key);
      if(flagged(key))continue;
      if(methods.has(key)) {
        if(!object(value))add('E_OPERATION_OBJECT',location);
        else if(Object.keys(value).length)add('U_OPERATION_CONTENT',location);
      } else if(['summary','description','parameters','servers'].includes(key)) {
        const valid = ['summary','description'].includes(key) ? typeof value === 'string' : Array.isArray(value);
        add(valid ? 'U_PATH_METADATA' : 'E_PATH_METADATA_TYPE',location);
      } else add('U_METHOD',location);
    }
  }
  diagnostics.sort((a,b)=>order(a.pointer,b.pointer)||order(a.code,b.code));
  const status = diagnostics.some(d=>d.code.startsWith('E_')) ? 'invalid' : diagnostics.length ? 'manual_review' : 'accepted';
  return {file:{status,byteLength,version,diagnostics},document};
}

export function compareSpecPair(baseText,currentText) {
  // Inspect BOTH positional inputs; no early pair return hides the other file.
  const base = inspect(baseText), current = inspect(currentText);
  const invalid = base.file.status === 'invalid' || current.file.status === 'invalid';
  const unsupportedVersion = [base,current].some(side=>side.file.diagnostics.some(d=>d.code === 'U_VERSION'));
  const comparisonPerformed = !invalid && !unsupportedVersion;
  const findings = [];
  if(comparisonPerformed) {
    for(const [path,item] of Object.entries(base.document.paths)) {
      if(!path.startsWith('/'))continue;
      const pointer = '/paths/'+token(path);
      if(!own(current.document.paths,path)) {
        findings.push({rule:'PATH_REMOVED',severity:'breaking',basePointer:pointer,currentPointer:null,
          evidence:{base:{present:true},current:{present:false}}});
        continue; // Entire-path removal suppresses every operation under it.
      }
      const now = current.document.paths[path];
      // Direct refs can supply unknown methods; nested refs do not hide explicit presence.
      if(own(item,'$ref') || own(now,'$ref'))continue;
      for(const method of methods) {
        if(own(item,method) && !own(now,method))
          findings.push({rule:'OPERATION_REMOVED',severity:'breaking',basePointer:pointer+'/'+method,currentPointer:null,
            evidence:{base:{present:true,method},current:{present:false,method}}});
      }
    }
  }
  findings.sort((a,b)=>order(a.basePointer,b.basePointer)||order(a.rule,b.rule));
  const pathRemoved = findings.filter(f=>f.rule === 'PATH_REMOVED').length;
  const operationRemoved = findings.filter(f=>f.rule === 'OPERATION_REMOVED').length;
  return {
    reportVersion:'specgate-diff/1',direction:'base-to-current',status:invalid ? 'invalid' : 'manual_review',comparisonPerformed,
    files:{base:base.file,current:current.file},findings,
    summary:{pathRemoved,operationRemoved,total:findings.length},
    coverage:{rules:['PATH_REMOVED','OPERATION_REMOVED'],matching:'exact-path-and-lowercase-method',
      unassessed:['reference-resolution','schemas','parameters','request-bodies','responses','security','runtime-consumers'],reviewRequired:true}
  };
}
