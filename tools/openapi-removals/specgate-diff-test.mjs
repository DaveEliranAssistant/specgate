import test from 'node:test';
import assert from 'node:assert/strict';

let compareSpecPair;
try { ({compareSpecPair} = await import('./specgate-diff.mjs')); }
catch(error) { if(error.code !== 'ERR_MODULE_NOT_FOUND')throw error; }
const J=(paths,extra={})=>JSON.stringify({openapi:'3.0.3',info:{title:'Demo',version:'1'},paths,...extra});
const D=(code,pointer)=>({code,pointer});
const token=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const P=path=>({rule:'PATH_REMOVED',severity:'breaking',basePointer:'/paths/'+token(path),currentPointer:null,evidence:{base:{present:true},current:{present:false}}});
const O=(path,method)=>({rule:'OPERATION_REMOVED',severity:'breaking',basePointer:'/paths/'+token(path)+'/'+method,currentPointer:null,evidence:{base:{present:true,method},current:{present:false,method}}});
const coverage=()=>({rules:['PATH_REMOVED','OPERATION_REMOVED'],matching:'exact-path-and-lowercase-method',unassessed:['reference-resolution','schemas','parameters','request-bodies','responses','security','runtime-consumers'],reviewRequired:true});
const file=(text,diagnostics=[],version='3.0.3')=>({status:diagnostics.some(d=>d.code.startsWith('E_'))?'invalid':diagnostics.length?'manual_review':'accepted',byteLength:typeof text==='string'?new TextEncoder().encode(text).byteLength:null,version,diagnostics});
function expected(base,current,findings=[],bd=[],cd=[]){return {reportVersion:'specgate-diff/1',direction:'base-to-current',status:'manual_review',comparisonPerformed:true,files:{base:file(base,bd),current:file(current,cd)},findings,summary:{pathRemoved:findings.filter(f=>f.rule==='PATH_REMOVED').length,operationRemoved:findings.filter(f=>f.rule==='OPERATION_REMOVED').length,total:findings.length},coverage:coverage()};}

test('actual two-spec comparison returns exact path and operation removal evidence',()=>{
  assert.equal(typeof compareSpecPair,'function','SG02 compareSpecPair has not been implemented');
  const base=J({'/gone':{get:{},post:{}},'/keep':{get:{},post:{}}});
  const current=J({'/keep':{post:{}}});
  assert.deepEqual(compareSpecPair(base,current),expected(base,current,[P('/gone'),O('/keep','get')]));
});

// Literal contract oracles; P/O are data constructors, not a diff algorithm.
const fixtures=[
 ['F01',{}, {},[]],
 ['F02',{'/gone':{get:{},post:{}}},{},[P('/gone')]],
 ['F03',{'/keep':{get:{},post:{}}},{'/keep':{post:{}}},[O('/keep','get')]],
 ['F04',{'/keep':{get:{}}},{'/keep':{get:{}}},[]],
 ['F05',{'/keep':{get:{}}},{'/keep':{get:{},post:{}},'/new':{get:{}}},[]],
 ['F06',{'/keep':{get:{},post:{}},'/new':{get:{}}},{'/keep':{get:{}}},[O('/keep','post'),P('/new')]],
 ['F07',{'/z':{get:{}},'/a':{post:{},get:{}}},{'/a':{}},[O('/a','get'),O('/a','post'),P('/z')]],
 ['F08',{'/a~b/c':{get:{}}},{'/a~b/c':{}},[O('/a~b/c','get')]],
 ['F09',{'/a':{summary:'old',get:{}}},{'/a':{description:'new',get:{}}},[],[D('U_PATH_METADATA','/paths/~1a/summary')],[D('U_PATH_METADATA','/paths/~1a/description')]],
 ['F10',{'/a':{get:{}}},{'/a':{GET:{}}},[O('/a','get')],[],[D('U_METHOD','/paths/~1a/GET')]],
 ['F11',{'/a':{get:{}}},{'/a':{$ref:'https://example.invalid/spec.json#/p'}},[],[],[D('U_REF','/paths/~1a/$ref')]],
 ['F12',{'/a':{$ref:'#/x'}},{},[P('/a')],[D('U_REF','/paths/~1a/$ref')]],
 ['F13',{'/a':{get:{responses:{'200':{description:'ok'}}}}},{'/a':{}},[O('/a','get')],[D('U_OPERATION_CONTENT','/paths/~1a/get')]],
 ['F14',{'/a/{id}':{get:{}}},{'/a/{name}':{get:{}}},[P('/a/{id}')]],
 ['F15',{'/a':{get:{}}},{'/a':{connect:{}}},[O('/a','get')],[],[D('U_METHOD','/paths/~1a/connect')]],
 ['F16',{'/a':{get:{schema:{oneOf:[],$ref:'local.json'}}}},{},[P('/a')],[D('U_OPERATION_CONTENT','/paths/~1a/get'),D('U_REF','/paths/~1a/get/schema/$ref'),D('U_CONSTRUCT','/paths/~1a/get/schema/oneOf')]]
];
for(const [name,b,c,findings,bd=[],cd=[]] of fixtures)test(name+' exact complete report',()=>{
 const base=J(b),current=J(c);assert.deepEqual(compareSpecPair(base,current),expected(base,current,findings,bd,cd));
});
for(const method of ['get','put','post','delete','options','head','patch','trace'])test('exact lowercase method '+method,()=>{
 const other=method==='post'?'get':'post',base=J({'/a':{[method]:{},[other]:{}}}),current=J({'/a':{[other]:{}}});
 assert.deepEqual(compareSpecPair(base,current),expected(base,current,[O('/a',method)]));
});

test('direction reversals and input order independence',()=>{
 for(const name of ['F02','F03','F08','F14']){
  const [,b,c]=fixtures.find(f=>f[0]===name),base=J(c),current=J(b);
  assert.deepEqual(compareSpecPair(base,current),expected(base,current,name==='F14'?[P('/a/{name}')]:[]));
 }
 const b=J({'/a':{get:{},post:{}},'/z':{get:{}}}),c=J({'/a':{}});
 assert.deepEqual(compareSpecPair(b,c),expected(b,c,[O('/a','get'),O('/a','post'),P('/z')]));
 // Astral/BMP keys distinguish code-unit ordering from locale/code-point ordering.
 const x=J({'/\ue000':{},'/\ud800\udc00':{}}),y=J({});
 assert.deepEqual(compareSpecPair(x,y),expected(x,y,[P('/\ud800\udc00'),P('/\ue000')]));
});

test('empty path presence, metadata, extensions and operation payload are explicit',()=>{
 const b=J({'/empty':{},'/a':{summary:'x',description:'y',parameters:[],servers:[],get:{responses:{}}},'x-note':{}});
 const c=J({'/a':{get:{responses:{}}}});
 const bd=[D('U_FIELD','/paths/x-note'),D('U_PATH_METADATA','/paths/~1a/description'),D('U_OPERATION_CONTENT','/paths/~1a/get'),D('U_PATH_METADATA','/paths/~1a/parameters'),D('U_PATH_METADATA','/paths/~1a/servers'),D('U_PATH_METADATA','/paths/~1a/summary')];
 assert.deepEqual(compareSpecPair(b,c),expected(b,c,[P('/empty')],bd,[D('U_OPERATION_CONTENT','/paths/~1a/get')]));
 const same=J({'/a':{get:{schema:{type:'string'}}}}),ds=[D('U_OPERATION_CONTENT','/paths/~1a/get')];
 assert.deepEqual(compareSpecPair(same,same),expected(same,same,[],ds,ds));
});

function changed(fn){const x=JSON.parse(J({}));fn(x);return JSON.stringify(x);}
const invalidCases=[
 [undefined,[D('E_INPUT_TYPE','')],null],[null,[D('E_INPUT_TYPE','')],null],[{},[D('E_INPUT_TYPE','')],null],
 ['', [D('E_EMPTY_INPUT','')],null],[' \n',[D('E_EMPTY_INPUT','')],null],['{',[D('E_INVALID_JSON','')],null],['openapi: 3.0.3',[D('E_INVALID_JSON','')],null],
 ...['null','[]','1'].map(x=>[x,[D('E_ROOT_OBJECT','')],null]),
 [changed(x=>delete x.openapi),[D('E_VERSION_REQUIRED','/openapi')],null],
 [changed(x=>x.openapi=3),[D('E_VERSION_TYPE','/openapi')],null],
 [changed(x=>delete x.info),[D('E_INFO_REQUIRED','/info')],'3.0.3'],
 [changed(x=>x.info=[]),[D('E_INFO_OBJECT','/info')],'3.0.3'],
 [changed(x=>x.info={title:'',version:1}),[D('E_INFO_TITLE','/info/title'),D('E_INFO_VERSION','/info/version')],'3.0.3'],
 [changed(x=>x.info.description=null),[D('E_INFO_DESCRIPTION','/info/description')],'3.0.3'],
 [changed(x=>delete x.paths),[D('E_PATHS_REQUIRED','/paths')],'3.0.3'],
 [changed(x=>x.paths=[]),[D('E_PATHS_OBJECT','/paths')],'3.0.3'],
 [J({bad:{}}),[D('E_PATH_KEY','/paths/bad')],'3.0.3'],
 ...[null,[]].map(v=>[J({'/a':v}),[D('E_PATH_ITEM_OBJECT','/paths/~1a')],'3.0.3']),
 ...[null,[]].map(v=>[J({'/a':{get:v}}),[D('E_OPERATION_OBJECT','/paths/~1a/get')],'3.0.3']),
 [J({'/a':{summary:2}}),[D('E_PATH_METADATA_TYPE','/paths/~1a/summary')],'3.0.3'],
 [J({'/a':{parameters:{}}}),[D('E_PATH_METADATA_TYPE','/paths/~1a/parameters')],'3.0.3'],
 [J({'/a':{$ref:2}}),[D('E_REF_TYPE','/paths/~1a/$ref')],'3.0.3']
];
for(const [i,[bad,ds,version]] of invalidCases.entries())test('invalid input '+i+' retains BOTH positional summaries',()=>{
 const valid=J({});
 for(const side of ['base','current']){
  const b=side==='base'?bad:valid,c=side==='current'?bad:valid;
  const want=expected(b,c);want.status='invalid';want.comparisonPerformed=false;want.files[side]=file(bad,ds,version);
  assert.deepEqual(compareSpecPair(b,c),want);
 }
});

test('unsupported versions suppress comparison while numeric 3.0 patches remain eligible',()=>{
 const valid=J({});
 for(const version of ['3.1.0','3.2.0','2.0',' 3.0.3','3.0.3-beta','3.0.3\n','3.0.3\r','3.0.3\r\n','3.0.3\u2028','3.0.3\u2029'])for(const side of ['base','current']){
  const bad=changed(x=>x.openapi=version),b=side==='base'?bad:valid,c=side==='current'?bad:valid,want=expected(b,c);
  want.comparisonPerformed=false;want.files[side]=file(bad,[D('U_VERSION','/openapi')],version);
  assert.deepEqual(compareSpecPair(b,c),want);
 }
 const b=J({'/gone':{}},{openapi:'3.0.99'}),c=J({}),want=expected(b,c,[P('/gone')]);want.files.base.version='3.0.99';assert.deepEqual(compareSpecPair(b,c),want);
});

test('inclusive UTF-8 size boundary including multibyte text, oversize preempts parse',()=>{
 const valid=J({}),encoder=new TextEncoder(),limit=1048576;
 const ascii=valid+' '.repeat(limit-encoder.encode(valid).byteLength);
 assert.deepEqual(compareSpecPair(ascii,valid),expected(ascii,valid));
 const seed=J({},{info:{title:'Demo',version:'1',description:''}}),spare=limit-encoder.encode(seed).byteLength;
 const multi=J({},{info:{title:'Demo',version:'1',description:'é'.repeat(Math.floor(spare/2))+'a'.repeat(spare%2)}});
 assert.equal(encoder.encode(multi).byteLength,limit);assert.ok(multi.length<limit);
 assert.deepEqual(compareSpecPair(multi,valid),expected(multi,valid));
 for(const bad of [ascii+' ',multi+' ', ' '.repeat(limit+1),'{'.repeat(limit+1)])for(const side of ['base','current']){
  const b=side==='base'?bad:valid,c=side==='current'?bad:valid,want=expected(b,c);want.status='invalid';want.comparisonPerformed=false;want.files[side]=file(bad,[D('E_INPUT_TOO_LARGE','')],null);assert.deepEqual(compareSpecPair(b,c),want);
 }
});

function nested(depth,arrays){let v=arrays?[]:{};for(let i=1;i<depth;i++)v=arrays?[v]:{child:v};return J({},{extra:v});}
test('object and array depth64 inclusive; overflow65 precedes structural diagnostics',()=>{
 const valid=J({});for(const arrays of [false,true]){
  const a=nested(64,arrays);assert.deepEqual(compareSpecPair(a,valid),expected(a,valid,[],[D('U_FIELD','/extra')]));
  const b=nested(65,arrays),want=expected(b,valid);want.status='invalid';want.comparisonPerformed=false;want.files.base=file(b,[D('E_MAX_DEPTH','')]);assert.deepEqual(compareSpecPair(b,valid),want);
  const x=JSON.parse(b);delete x.info;delete x.paths;const bad=JSON.stringify(x),other=expected(bad,valid);other.status='invalid';other.comparisonPerformed=false;other.files.base=file(bad,[D('E_MAX_DEPTH','')]);assert.deepEqual(compareSpecPair(bad,valid),other);
 }
});

test('all reference forms are diagnostics only, retained direct refs suppress operation checks',()=>{
 for(const ref of ['#/x','local.json','https://example.invalid/spec.json','file:///NO_READ','//example.invalid/x']){
  const b=J({'/a':{get:{}}}),c=J({'/a':{$ref:ref}});assert.deepEqual(compareSpecPair(b,c),expected(b,c,[],[],[D('U_REF','/paths/~1a/$ref')]));
  assert.deepEqual(compareSpecPair(c,b),expected(c,b,[],[D('U_REF','/paths/~1a/$ref')]));
  const empty=J({});assert.deepEqual(compareSpecPair(c,empty),expected(c,empty,[P('/a')],[D('U_REF','/paths/~1a/$ref')]));
 }
 const b=J({'/a':{get:{$ref:'#/explicit'}}}),c=J({'/a':{}});
 assert.deepEqual(compareSpecPair(b,c),expected(b,c,[O('/a','get')],[D('U_OPERATION_CONTENT','/paths/~1a/get'),D('U_REF','/paths/~1a/get/$ref')]));
});

test('unassessed root/operation content is globally scanned without recursive U_FIELD noise',()=>{
 const b=J({'/gone':{get:{}}},{components:{$ref:'https://example.invalid/x'}}),c=J({});
 assert.deepEqual(compareSpecPair(b,c),expected(b,c,[P('/gone')],[D('U_FIELD','/components'),D('U_REF','/components/$ref')]));
 for(const key of ['allOf','anyOf','oneOf','not','discriminator','additionalProperties']){
  const base=J({'/a':{get:{schema:{[key]:false}}}}),current=J({'/a':{}});
  assert.deepEqual(compareSpecPair(base,current),expected(base,current,[O('/a','get')],[D('U_OPERATION_CONTENT','/paths/~1a/get'),D('U_CONSTRUCT','/paths/~1a/get/schema/'+key)]));
  const direct=J({'/a':{[key]:false}});assert.deepEqual(compareSpecPair(direct,c),expected(direct,c,[P('/a')],[D('U_CONSTRUCT','/paths/~1a/'+key)]));
 }
 const array=J({},{extra:[{$ref:'#/a',inside:{$ref:'b'}}]});
 assert.deepEqual(compareSpecPair(array,c),expected(array,c,[],[D('U_FIELD','/extra'),D('U_REF','/extra/0/$ref'),D('U_REF','/extra/0/inside/$ref')]));
 const bad=J({'/gone':{}},{extra:[{$ref:false}]});const want=expected(bad,c);want.status='invalid';want.comparisonPerformed=false;want.files.base=file(bad,[D('U_FIELD','/extra'),D('E_REF_TYPE','/extra/0/$ref')]);assert.deepEqual(compareSpecPair(bad,c),want);
});

test('last-key-wins is explicit; no prototype pollution, raw values or result aliasing',()=>{
 const dup='{"openapi":"3.1.0","openapi":"3.0.3","info":{"title":"Demo","version":"1"},"paths":{"/gone":{}},"paths":{}}',empty=J({});
 assert.deepEqual(compareSpecPair(dup,empty),expected(dup,empty));
 const proto='{"openapi":"3.0.3","info":{"title":"Demo","version":"1"},"paths":{"/__proto__":{"get":{}}},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}';
 const before=Object.getOwnPropertyDescriptors(Object.prototype);
 assert.deepEqual(compareSpecPair(proto,empty),expected(proto,empty,[P('/__proto__')],[D('U_FIELD','/__proto__'),D('U_FIELD','/constructor')]));
 assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype),before);assert.equal({}.polluted,undefined);
 const a=J({'/gone':{get:{}}}),c=J({}),first=compareSpecPair(a,c);
 first.findings[0].evidence.base.present=false;first.coverage.rules.push('FAKE');first.files.base.diagnostics.push(D('FAKE',''));first.summary.total=999;
 assert.deepEqual(compareSpecPair(empty,empty),expected(empty,empty));
 const keep=J({'/keep':{get:{},post:{}}}),now=J({'/keep':{post:{}}});assert.deepEqual(compareSpecPair(keep,now),expected(keep,now,[O('/keep','get')]));
 assert.deepEqual(compareSpecPair(a,c),expected(a,c,[P('/gone')]));
 const secret=J({'/a':{get:{description:'PRIVATE_VALUE_CANARY_91'}}},{info:{title:'PRIVATE_VALUE_CANARY_91',version:'1'}});
 assert.ok(!JSON.stringify(compareSpecPair(secret,empty)).includes('PRIVATE_VALUE_CANARY_91'));
});

test('unexpected platform/programming exceptions propagate instead of successful reports',()=>{
 const original=JSON.parse,sentinel=new Error('synthetic internal failure');
 try{JSON.parse=()=>{throw sentinel;};assert.throws(()=>compareSpecPair(J({}),J({})),error=>error===sentinel);}finally{JSON.parse=original;}
});

test('fresh module import and invocation attempt no selected filesystem/network/storage/logging APIs',async()=>{
 const fs=(await import('node:fs')).default,fp=(await import('node:fs/promises')).default;
 const http=(await import('node:http')).default,https=(await import('node:https')).default;
 const net=(await import('node:net')).default,tls=(await import('node:tls')).default,dns=(await import('node:dns')).default;
 const source=await fp.readFile(new URL('./specgate-diff.mjs',import.meta.url),'utf8');
 const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
 const targets=[
  [globalThis,['fetch','WebSocket','XMLHttpRequest','EventSource']],
  [fs,['readFile','readFileSync','writeFile','writeFileSync','appendFile','appendFileSync','open','openSync','createReadStream','createWriteStream']],
  [fp,['readFile','writeFile','appendFile','open']],
  [http,['request','get']],[https,['request','get']],
  [net,['connect','createConnection']],[tls,['connect']],[dns,['lookup','resolve']],
  [console,['log','warn','error','info','debug']]
 ];
 function install(observations){
  const restore=[];
  for(const [owner,names] of targets)for(const key of names){
   const descriptor=Object.getOwnPropertyDescriptor(owner,key);
   Object.defineProperty(owner,key,{configurable:true,writable:true,value:function(){observations.push(key);throw Error('selected API denied');}});
   restore.push(()=>descriptor?Object.defineProperty(owner,key,descriptor):delete owner[key]);
  }
  for(const key of ['localStorage','sessionStorage','indexedDB']){
   const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
   Object.defineProperty(globalThis,key,{configurable:true,get(){observations.push(key);throw Error('storage denied');}});
   restore.push(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]);
  }
  return ()=>restore.reverse().forEach(fn=>fn());
 }
 const calibration=[],undo=install(calibration);
 try {
  assert.throws(()=>fs.readFileSync('SYNTHETIC_MUST_NOT_OPEN'));
  assert.throws(()=>globalThis.fetch('https://example.invalid/MUST_NOT_SEND'));
  assert.throws(()=>globalThis.localStorage);
 }finally{undo();}
 assert.deepEqual(calibration,['readFileSync','fetch','localStorage']);
 const runtime=[],restore=install(runtime);
 try {
  const fresh=await import(url);
  for(const ref of ['#/x','local.json','https://example.invalid/x','file:///MUST_NOT_OPEN','//example.invalid/x']){
   const b=J({'/a':{get:{$ref:ref}}}),c=J({'/a':{}});
   assert.deepEqual(fresh.compareSpecPair(b,c),expected(b,c,[O('/a','get')],[D('U_OPERATION_CONTENT','/paths/~1a/get'),D('U_REF','/paths/~1a/get/$ref')]));
  }
 }finally{restore();}
 assert.deepEqual(runtime,[]);
});

