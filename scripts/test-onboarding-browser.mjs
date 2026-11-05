import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {buildOnboarding} from './build-onboarding.mjs';
const work=mkdtempSync(join(tmpdir(),'specgate-onboarding-browser-'));
const site=join(work,'site');buildOnboarding(site);
const evidence=process.env.ONBOARDING_EVIDENCE_DIR?resolve(process.env.ONBOARDING_EVIDENCE_DIR):join(work,'evidence');mkdirSync(evidence,{recursive:true});
const allow=new Map([['/','index.html'],['/index.html','index.html'],...['pilot-brief.md','quickstart.md','quickstart.sh','trust.md'].map(x=>['/'+x,x])]);
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
 const file=allow.get(path);if(req.method!=='GET'||!file){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.end(readFileSync(join(site,file)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
let browser;const result={url,checks:[],accessibility:[],externalRequests:[]};
try{
 browser=await chromium.launch({headless:true,...(process.env.REPORT_BROWSER_CHANNEL?{channel:process.env.REPORT_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith(url+'/'))result.externalRequests.push(r.url());});
 await page.goto(url);await page.getByRole('heading',{name:'Your first useful API change review.'}).waitFor();
 await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Skip to onboarding');await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,'#main');result.checks.push('keyboard-skip-link');
 await page.getByRole('button',{name:'Check pilot fit',exact:true}).click();assert.match(await page.locator('#fit-result').textContent(),/Needs a scope review/);
 for(const [id,value] of Object.entries({framework:'literal',committed:'yes',node:'22',platform:'linux'}))await page.locator('#'+id).selectOption(value);
 await page.getByRole('button',{name:'Check pilot fit',exact:true}).click();assert.match(await page.locator('#fit-result').textContent(),/Good fit/);
 await page.locator('#framework').selectOption('typescript');await page.getByRole('button',{name:'Check pilot fit',exact:true}).click();assert.match(await page.locator('#fit-result').textContent(),/Needs a scope review/);result.checks.push('supported-and-unsupported-fit');
 await page.getByRole('button',{name:'Source changed · exit 1',exact:true}).click();assert.match(await page.locator('#example-report').textContent(),/source-changed/);assert.match(await page.locator('#example-explanation').textContent(),/not a proven consumer break/);
 await page.getByRole('button',{name:'Unsupported · exit 1',exact:true}).click();assert.equal(await page.locator('#example-state').textContent(),'REVIEW REQUIRED');assert.equal(JSON.parse(await page.locator('#example-report').textContent()).complete,false);
 const summary=page.getByText('Inspect the actual JSON report',{exact:true});await summary.focus();await page.keyboard.press('Space');assert.equal(await summary.evaluate(e=>e.parentElement.open),true);result.checks.push('recorded-results-and-keyboard-disclosure');
 await page.getByRole('button',{name:'Copy command',exact:true}).click();await page.waitForFunction(()=>document.getElementById('copy-status').textContent.startsWith('Copied.'));assert.match(await page.locator('#copy-status').textContent(),/Copied/);assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/bash quickstart.sh/);
 await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{value:async()=>{throw new Error('clipboard denied');},configurable:true}));
 await page.getByRole('button',{name:'Copy command',exact:true}).click();assert.match(await page.locator('#copy-status').textContent(),/Clipboard unavailable/);result.checks.push('copy-success-and-honest-fallback');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Download your pilot brief',exact:false}).click();const download=await downloadEvent;assert.equal(download.suggestedFilename(),'pilot-brief.md');await download.saveAs(join(evidence,'downloaded-pilot-brief.md'));assert.match(readFileSync(join(evidence,'downloaded-pilot-brief.md'),'utf8'),/LOCAL TEMPLATE ONLY/);result.checks.push('actual-pilot-brief-download');
 for(const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))){
  if(href.startsWith('#'))assert.ok(await page.locator(href).count(),href);
  else{const response=await context.request.get(url+'/'+href);assert.equal(response.status(),200,href);}
 }
 for(const path of ['/packages/specgate/src/scan.mjs','/README.md','/.git/config'])assert.equal((await context.request.get(url+path)).status(),404);
 result.checks.push('all-navigation-and-download-links','no-repository-source-served');
 await page.getByRole('button',{name:'Supported scan · exit 0',exact:true}).click();await page.locator('#framework').selectOption('literal');await page.getByRole('button',{name:'Check pilot fit',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));
 const desktopAxe=await new AxeBuilder({page}).analyze();result.accessibility.push({viewport:'desktop',violations:desktopAxe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>n.target)}))});
 await page.screenshot({path:join(evidence,'desktop.png')});await page.screenshot({path:join(evidence,'desktop-full.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile must not overflow horizontally');
 const mobileAxe=await new AxeBuilder({page}).analyze();result.accessibility.push({viewport:'mobile',violations:mobileAxe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>n.target)}))});
 await page.screenshot({path:join(evidence,'mobile.png')});await page.screenshot({path:join(evidence,'mobile-full.png'),fullPage:true});result.checks.push('mobile-no-overflow');
 const offline=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});const nojs=await offline.newPage();await nojs.goto(url);assert.match(await nojs.locator('noscript').textContent(),/JavaScript is disabled/);assert.equal(await nojs.getByRole('button',{name:'Check pilot fit'}).count(),0);assert.equal(await nojs.getByRole('link',{name:'Download your pilot brief',exact:false}).count(),1);await offline.close();result.checks.push('no-javascript-fallback');
 assert.deepEqual(errors,[]);assert.deepEqual(result.externalRequests,[]);result.checks.push('no-browser-errors','no-external-requests');
 writeFileSync(join(evidence,'browser.json'),JSON.stringify(result,null,2)+'\n');
 assert.equal(result.accessibility.reduce((n,r)=>n+r.violations.length,0),0,JSON.stringify(result.accessibility));
 console.log(JSON.stringify({...result,evidence,passed:true},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));rmSync(work,{recursive:true,force:true});}
