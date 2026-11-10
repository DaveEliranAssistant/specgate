import { openSync, readFileSync, closeSync, writeFileSync, fstatSync, constants } from 'node:fs';
import { scanRepository } from './scan.mjs';
import { compareScans } from './gate.mjs';
import { runDiff, diffMarkdown } from './diff.mjs';
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const HELP = `SpecGate ${VERSION} — code-first local change gate (no OpenAPI input)
scan --root REPOSITORY --source RELATIVE_PATH [--source RELATIVE_PATH] [--format json|markdown] [--output NEW_FILE]
check --root REPOSITORY --source RELATIVE_PATH --baseline TRUSTED_SCAN.json [--format json|markdown] [--output NEW_FILE]
generate --root REPOSITORY --source RELATIVE_PATH --scenarios REVIEWED.json --output NEW_SPEC.mjs
diff --root REPOSITORY --source RELATIVE_PATH --base REF --head REF [--base-mode merge-base|tip] [--format json|markdown] [--output NEW_FILE]
  (preview) Will this change break API consumers? Scans both committed revisions; compares head with
  merge-base(base, head) by default. Never starts the service. Refs must exist locally (fetch first).
Exit: 0 declared-subset success; 1 findings/partial analysis; 2 input/tool failure.
diff exit: 0 no breaking/needs-review item found within the supported scope (NOT a compatibility guarantee);
  1 breaking change or needs review (includes every analysis gap); 2 unreadable input or analysis failure.
Only committed Git source is scanned. --revision HEAD|FULL_COMMIT_SHA selects the revision (default HEAD).
Baseline and scenario files must come from a trusted reviewed revision, not an untrusted pull request.
`;
export function readJson(path) {
 const fd=openSync(path, constants.O_RDONLY|constants.O_NOFOLLOW);
 try { const st=fstatSync(fd); if (!st.isFile()||st.size>10485760) throw new Error('JSON input limit'); const bytes=readFileSync(fd); if(bytes.length>10485760)throw new Error('JSON input limit'); return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } finally {closeSync(fd);}
}
function parse(args) {
 const [command,...rest]=args;
 if (!['scan','check','generate','diff'].includes(command))throw new Error('Unknown command');
 const allowed=new Set(['--root','--source','--format','--output',...(command==='diff'?['--base','--head','--base-mode']:['--revision']),...(command==='check'?['--baseline']:[]),...(command==='generate'?['--scenarios']:[])]);
 const options={root:'.',sources:[],format:'json'},seen=new Set();
 for(let i=0;i<rest.length;i+=2){const key=rest[i],value=rest[i+1];if(!allowed.has(key)||typeof value!=='string'||!value||value.startsWith('--')||(key!=='--source'&&seen.has(key)))throw new Error('Invalid arguments'); seen.add(key); if(key==='--source')options.sources.push(value);else options[key.slice(2)]=value;}
 if(!['json','markdown'].includes(options.format)||!options.sources.length||(command==='check'&&!options.baseline)||(command==='diff'&&(!options.base||!options.head))||(command==='generate'&&(!options.scenarios||!options.output||options.format!=='json')))throw new Error('Missing or invalid arguments');
 return {command,options};
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_|\[\]]/g,'\\$&').replace(/[\r\n]/g,' ');
function markdown(report){
 if(report.schemaVersion==='specgate.check/1')return '# SpecGate code-first check\n\n'+(report.passed?'PASS — unchanged declared subset':'REVIEW REQUIRED')+'\n\n'+report.findings.map(f=>`- ${escape(f.code)} ${escape(f.path??f.file??f.routeId??'')} ${escape(f.reason??'')}`).join('\n')+'\n\n'+report.warning+'\n';
 return '# SpecGate code-first scan\n\n'+(report.complete?'Declared subset analyzed':'PARTIAL — manual review required')+'\n\n'+report.routes.map(r=>`- ${escape(r.method)} ${escape(r.path)} — ${escape(r.file)}:${r.line}; auth: ${escape(r.auth)}`).join('\n')+'\n\n## Analysis gaps\n'+report.gaps.map(g=>`- ${escape(g.code)} ${escape(g.file??'')}:${g.line??''}`).join('\n')+'\n\n'+report.warning+'\n';
}
export async function main(args){
 try{
  if(args.length===1&&['--help','--version'].includes(args[0])){process.stdout.write(args[0]==='--help'?HELP:`${VERSION}\n`);return;}
  const {command,options}=parse(args);
  if(command==='diff'){
   const report=await runDiff({root:options.root,sources:options.sources,base:options.base,head:options.head,baseMode:options['base-mode']});
   const output=options.format==='markdown'?diffMarkdown(report):JSON.stringify(report,null,2)+'\n';
   if(options.output)writeFileSync(options.output,output,{flag:'wx',mode:0o600});else process.stdout.write(output);
   process.exitCode=report.verdict==='no_breaking_change_found_in_supported_scope'?0:1;
   return;
  }
  const baseline=command==='check'?readJson(options.baseline):null;
  const report=await scanRepository({root:options.root,sources:options.sources,revision:options.revision});
  let result=report,output;
  if(command==='check')result=compareScans(baseline,report);
  if(command==='generate'){
   const {generateTests}=await import('./generate.mjs');
   output=generateTests(readJson(options.scenarios),report);
  }else output=options.format==='markdown'?markdown(result):JSON.stringify(result,null,2)+'\n';
  if(options.output)writeFileSync(options.output,output,{flag:'wx',mode:0o600});else process.stdout.write(output);
  process.exitCode=(command==='check'?result.passed:report.complete)?0:1;
 }catch{process.stderr.write('SpecGate: invalid arguments/input, unreadable file, unsafe path, or resource limit. Use --help; input contents are never echoed.\n');process.exitCode=2;}
}
