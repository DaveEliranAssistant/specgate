import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extname, relative, resolve } from 'node:path';
const SKIP=new Set(['node_modules','.git','dist','build','coverage','.next']);
const EXTENSIONS=new Set(['.js','.mjs','.cjs','.jsx','.ts','.tsx']);
export function loadGitSources(root,scopes,revision,limits){
 if(revision!=='HEAD'&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision))throw new Error('Revision must be HEAD or an exact commit identifier');
 const deadline=Date.now()+limits.acquisitionTimeoutMs;
 // A caller may launch the CLI from a Git hook or another checkout. Git's
 // environment overrides -C, so do not inherit repository, object, or config
 // selectors. Keep ordinary runtime settings (PATH, locale, etc.).
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'});
 const command=(args,maxBuffer=4194304)=>{
  const remaining=deadline-Date.now();if(remaining<1)throw new Error('Git acquisition time limit exceeded');
  try {return execFileSync('git',['--no-replace-objects','--literal-pathspecs','-C',root,...args],{maxBuffer,timeout:Math.min(10000,remaining),stdio:['ignore','pipe','pipe'],env});}
  catch(error){if(error.code==='ETIMEDOUT'||Date.now()>=deadline)throw new Error('Git acquisition time limit exceeded');throw error;}
 };
 const sourceCommit=command(['rev-parse','--verify',revision+'^{commit}'],200).toString('ascii').trim();
 if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceCommit))throw new Error('Invalid resolved revision');
 const selected=scopes.map(s=>relative(root,resolve(root,s)).split('\\').join('/')||'.');
 const tree=command(['ls-tree','-rlz','--full-tree',sourceCommit,'--',...selected]);
 const records=new TextDecoder('utf-8',{fatal:true}).decode(tree).split('\0').filter(Boolean);
 if(records.length>limits.maxEntries)throw new Error('Git entry limit exceeded');
 const matched=new Set(),files=[];let total=0;
 for(const entry of records){
  const match=/^([0-7]{6}) (blob|commit) ([a-f0-9]+) +(-|[0-9]+)\t([\s\S]+)$/.exec(entry);if(!match)throw new Error('Unsupported Git tree entry');
  const [,mode,type,oid,sizeText,path]=match;
  if(path.startsWith('/')||path.split('/').some(p=>p==='..')||/[\u0000-\u001f\u007f]/.test(path)||path.includes('\\'))throw new Error('Unsafe Git source path');
  for(const scope of selected)if(scope==='.'||path===scope||path.startsWith(scope+'/'))matched.add(scope);
  if(path.split('/').some(part=>SKIP.has(part)))continue;
  if(mode==='120000')throw new Error('Committed symlinks are forbidden');
  if(type!=='blob'||!['100644','100755'].includes(mode))throw new Error('Unsupported Git submodule or entry mode');
  if(!EXTENSIONS.has(extname(path)))continue;
  const size=Number(sizeText);if(!Number.isSafeInteger(size)||size>limits.maxFileBytes||total+size>limits.maxTotalBytes||files.length>=limits.maxFiles)throw new Error('Git source resource limit exceeded');
  const bytes=command(['cat-file','blob',oid],Math.min(limits.maxFileBytes,limits.maxTotalBytes-total)+1);
  if(bytes.length!==size)throw new Error('Git object size changed');
  const actual=createHash(oid.length===64?'sha256':'sha1').update(`blob ${size}\0`).update(bytes).digest('hex');if(actual!==oid)throw new Error('Git object integrity failure');
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(source.includes('\0'))throw new Error('Binary source file refused');
  total+=size;files.push({path,source});
 }
 if(selected.some(s=>!matched.has(s)))throw new Error('Source scope missing from revision');
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {files,sourceCommit};
}
