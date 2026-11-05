import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {databaseUrl,handleWaitlistPost} from '../lib/waitlist/handle.mjs';
import {MAX_WAITLIST_BYTES,WAITLIST_SUCCESS,WAITLIST_UNAVAILABLE} from '../lib/waitlist/messages.mjs';
import {createRateLimiter} from '../lib/waitlist/rate-limit.mjs';
import {normalizeEmail} from '../lib/waitlist/validate.mjs';
const valid={email:'  Person@Example.COM ',consent:true};
const request=(body,headers={})=>new Request('https://specgate.example/api/waitlist',{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
async function post(body,deps={},headers){
 const inserted=[];
 const response=await handleWaitlistPost(request(body,headers),{databaseConfigured:true,insert:async row=>{inserted.push(row);},takeToken:()=>({allowed:true}),...deps});
 return {status:response.status,body:await response.json(),inserted};
}
test('stores a normalized email, source and hashed user agent only after consent',async()=>{
 const r=await post(valid,{},{'user-agent':'agent/1','x-forwarded-for':'203.0.113.9'});
 assert.equal(r.status,200);assert.equal(r.body.message,WAITLIST_SUCCESS);
 assert.deepEqual(r.inserted,[{email:'person@example.com',source:'landing',userAgentHash:createHash('sha256').update('agent/1').digest('hex')}]);
 assert.ok(!JSON.stringify(r.inserted).includes('203.0.113.9'));
 assert.equal(normalizeEmail(' A@B.CO '),'a@b.co');
});
test('rejects missing consent, a truthy non-boolean consent and invalid email without writing',async()=>{
 for(const [body,field] of [[{email:'a@b.co'},'consent'],[{email:'a@b.co',consent:'true'},'consent'],[{email:'nope',consent:true},'email'],[{email:`${'a'.repeat(250)}@b.co`,consent:true},'email'],[[],'email'],[null,'email']]){
  const r=await post(JSON.stringify(body));assert.equal(r.status,400);assert.ok(r.body.fields[field]);assert.deepEqual(r.inserted,[]);
 }
 const bad=await post('{oops');assert.equal(bad.status,400);assert.deepEqual(bad.inserted,[]);
});
test('never claims success when the database is missing or the write fails',async()=>{
 const missing=await post(valid,{databaseConfigured:false});assert.equal(missing.status,503);assert.equal(missing.body.message,WAITLIST_UNAVAILABLE);assert.deepEqual(missing.inserted,[]);
 const secret='postgres://user:pw@db.example/x';
 const failed=await post(valid,{insert:async()=>{throw new Error(secret);}});assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.body).includes(secret));assert.notEqual(failed.body.ok,true);
});
test('honeypot looks successful but stores nothing',async()=>{
 const r=await post({...valid,company_website:'https://bot.example'});assert.equal(r.status,200);assert.deepEqual(r.inserted,[]);
});
test('bounds payload size and rate limits per address without storing it',async()=>{
 const big=await post({...valid,padding:'x'.repeat(MAX_WAITLIST_BYTES)});assert.equal(big.status,413);assert.deepEqual(big.inserted,[]);
 const limited=await post(valid,{takeToken:()=>({allowed:false})});assert.equal(limited.status,429);assert.deepEqual(limited.inserted,[]);
 const take=createRateLimiter({limit:2,windowMs:1000});
 assert.equal(take('a',0).allowed,true);assert.equal(take('a',1).allowed,true);assert.equal(take('a',2).allowed,false);assert.equal(take('b',2).allowed,true);assert.equal(take('a',1500).allowed,true);
});
test('database URL prefers pooled and ignores blanks',()=>{
 assert.equal(databaseUrl({DATABASE_URL_POOLED:' p ',DATABASE_URL:'d'}),'p');assert.equal(databaseUrl({DATABASE_URL_POOLED:'  ',DATABASE_URL:'d'}),'d');assert.equal(databaseUrl({}),null);
});
test('the deployed route is closed without a database and the schema stores no address',async()=>{
 const saved={pooled:process.env.DATABASE_URL_POOLED,direct:process.env.DATABASE_URL};delete process.env.DATABASE_URL_POOLED;delete process.env.DATABASE_URL;
 try{
  const {GET,POST}=await import('../api/waitlist.mjs');
  const get=await GET();assert.equal(get.status,503);assert.equal((await get.json()).available,false);
  assert.equal((await POST(request({email:'a@b.co',consent:true}))).status,503);
 }finally{if(saved.pooled!==undefined)process.env.DATABASE_URL_POOLED=saved.pooled;if(saved.direct!==undefined)process.env.DATABASE_URL=saved.direct;}
 const sql=readFileSync(new URL('../sql/waitlist.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS waitlist_signups/);assert.match(sql,/email text NOT NULL UNIQUE/);assert.match(sql,/CHECK \(consent\)/);assert.ok(!/\bip\b|address/i.test(sql));
 assert.deepEqual(readFileSync(new URL('../.env.example',import.meta.url),'utf8').match(/^[A-Z_]+=.*$/gm),['DATABASE_URL_POOLED=','DATABASE_URL=']);
});
