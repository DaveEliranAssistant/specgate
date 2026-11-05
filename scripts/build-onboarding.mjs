import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function read(name){const file=resolve(root,'onboarding',name);if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new Error('Only regular allowlisted files can be published');return readFileSync(file,'utf8');}
export function buildOnboarding(output){
 if(existsSync(output))throw new Error('Output already exists; use a new directory');
 let html=read('index.template.html');
 const values={STYLE:`<style>${read('styles.css')}</style>`,APP:`<script type="module">${read('app.mjs')}</script>`,RECORDINGS:`<script id="recordings" type="application/json">${JSON.stringify(JSON.parse(read('recordings.json'))).replaceAll('<','\\u003c')}</script>`};
 for(const [key,value] of Object.entries(values)){const token=`<!-- ONBOARDING_${key} -->`;if(html.split(token).length!==2)throw new Error('Invalid template marker');html=html.replace(token,()=>value);}
 const downloads=Object.fromEntries(['pilot-brief.md','quickstart.md','quickstart.sh','trust.md'].map(name=>[name,read(name)]));
 mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'index.html'),html,{flag:'wx'});
 for(const [name,text] of Object.entries(downloads))writeFileSync(resolve(output,name),text,{flag:'wx'});
 return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length>1)throw new Error('Usage: node scripts/build-onboarding.mjs [NEW_OUTPUT_DIRECTORY]');
 console.log(buildOnboarding(resolve(args[0]??'dist/onboarding')));
}
