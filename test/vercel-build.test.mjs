import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redactConnectionStrings,runVercelBuild} from '../scripts/vercel-build-lib.mjs';
const secret='postgres://user:super-secret-password@db.example.com:5432/specgate';
const quiet={log(){},error(){}};
test('skips the migration without a database URL and still builds',async()=>{
 let migrated=false,built=false;
 const code=await runVercelBuild({...quiet,env:{DATABASE_URL_POOLED:'   ',DATABASE_URL:''},migrate:async()=>{migrated=true;return {ok:true};},build:async()=>{built=true;return 0;}});
 assert.equal(code,0);assert.equal(migrated,false);assert.equal(built,true);
});
test('stops the build when migration fails and does not print the connection string',async()=>{
 let built=false;const errors=[];
 const code=await runVercelBuild({...quiet,env:{DATABASE_URL_POOLED:secret},error:line=>errors.push(line),migrate:async()=>({ok:false,message:`connect ECONNREFUSED ${secret}`}),build:async()=>{built=true;return 0;}});
 assert.equal(code,1);assert.equal(built,false);const text=errors.join('\n');
 assert.match(text,/The build was stopped/);for(const leak of [secret,'super-secret-password','postgres://','db.example.com'])assert.ok(!text.includes(leak),leak);
});
test('migrates before building and propagates a build failure',async()=>{
 const order=[];
 const code=await runVercelBuild({...quiet,env:{DATABASE_URL:secret},migrate:async()=>{order.push('migrate');return {ok:true};},build:async()=>{order.push('build');return 7;}});
 assert.deepEqual(order,['migrate','build']);assert.equal(code,7);
 assert.equal(redactConnectionStrings(`x ${secret} y`),'x [redacted-database-url] y');
});
