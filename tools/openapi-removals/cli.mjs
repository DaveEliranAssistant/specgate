import {constants,openSync,fstatSync,readSync,closeSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {buildResult} from './qe-result.mjs';
import {compareSpecPair} from './specgate-diff.mjs';
const warning='Only exact removed paths and lowercase HTTP operations are checked. No removals is not overall API compatibility. Reference resolution, schemas, parameters, request bodies, responses, security and runtime consumers remain unassessed. Manual review is always required. Duplicate JSON keys use last-key-wins.';
function readBounded(path){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=fstatSync(fd);if(!st.isFile()||st.size>1048576)throw Error();const buffer=Buffer.alloc(1048577);let length=0;while(length<buffer.length){const n=readSync(fd,buffer,length,buffer.length-length,null);if(!n)break;length+=n;}if(length>1048576)throw Error();return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,length));}finally{closeSync(fd);}}
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_|\[\]]/g,'\\$&').replace(/[\r\n]/g,' ');
function main(args){
 if(args.length===1&&args[0]==='--help'){console.log('SpecGate removal-only CLI: --base BASE.json --head HEAD.json --json NEW.json --markdown NEW.md\nExit 0 no detected removals (manual review remains); 1 removals; 2 input/tool failure.');return;}
 const options={};for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];if(!['--base','--head','--json','--markdown','--qe-result'].includes(k)||options[k]||!v||v.startsWith('--'))throw Error();options[k]=resolve(v);}
 options['--qe-result'] ||= options['--json']?join(dirname(options['--json']),'qe-result-specgate.json'):undefined;
 if(!['--base','--head','--json','--markdown','--qe-result'].every(k=>options[k])||new Set(Object.values(options)).size!==5||existsSync(options['--qe-result'])||options['--json']===options['--markdown']||[options['--json'],options['--markdown']].some(p=>existsSync(p)||[options['--base'],options['--head']].includes(p)))throw Error();
 const report=compareSpecPair(readBounded(options['--base']),readBounded(options['--head']));
 const code=!report.comparisonPerformed||report.status==='invalid'?2:report.findings.length?1:0;
 const result={...report,cli:{exitCode:code,gate:code===2?'ERROR':code===1?'FAIL_REMOVALS':'PASS_REMOVAL_RULES_ONLY',warning}};
 const lines=['# SpecGate — OpenAPI removal-only gate','',`**${result.cli.gate}**`,'',warning,'',`Removed paths: ${report.summary.pathRemoved}; removed operations: ${report.summary.operationRemoved}.`,'','## Findings','',...report.findings.map(f=>`- **${f.rule}** at ${esc(f.basePointer)}`)];
 if(!report.findings.length)lines.push('No removal findings.');
 lines.push('','## Diagnostics / unassessed content','');
 for(const side of ['base','current'])for(const d of report.files[side].diagnostics)lines.push(`- ${side}: ${esc(d.code)} at ${esc(d.pointer)}`);
 writeFileSync(options['--json'],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});writeFileSync(options['--markdown'],lines.join('\n')+'\n',{flag:'wx',mode:0o600});
 writeFileSync(options['--qe-result'],JSON.stringify(buildResult(result,lines.join('\n')+'\n',code),null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(`SpecGate removal-only: ${result.cli.gate}; ${report.summary.total} findings. Manual review required.`);process.exitCode=code;
}
try{main(process.argv.slice(2));}catch{console.error('SpecGate: invalid arguments, unsafe/oversized input, existing output or local I/O failure. Input contents are not echoed. Use --help.');process.exitCode=2;}
