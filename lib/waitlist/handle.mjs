import {createHash} from 'node:crypto';
import {MAX_WAITLIST_BYTES,WAITLIST_INVALID,WAITLIST_JSON_ERROR,WAITLIST_RATE_LIMITED,WAITLIST_SOURCE,WAITLIST_SUCCESS,WAITLIST_TOO_LARGE,WAITLIST_UNAVAILABLE} from './messages.mjs';
import {validateWaitlistInput} from './validate.mjs';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const json=(status,body)=>Response.json(body,{status});
const success=()=>json(200,{ok:true,message:WAITLIST_SUCCESS});
export function databaseUrl(env=process.env){return env.DATABASE_URL_POOLED?.trim()||env.DATABASE_URL?.trim()||null;}
export async function handleWaitlistPost(request,deps){
 try{
  const declared=request.headers.get('content-length');
  if(declared&&Number(declared)>MAX_WAITLIST_BYTES)return json(413,{ok:false,message:WAITLIST_TOO_LARGE});
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>MAX_WAITLIST_BYTES)return json(413,{ok:false,message:WAITLIST_TOO_LARGE});
  const now=deps.now?deps.now():Date.now();
  const address=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  let allowed=true;
  try{allowed=deps.takeToken(sha256(address),now).allowed;}catch{allowed=true;}
  if(!allowed)return json(429,{ok:false,message:WAITLIST_RATE_LIMITED});
  let parsed;
  try{parsed=text.trim().length===0?null:JSON.parse(text);}catch{return json(400,{ok:false,message:WAITLIST_JSON_ERROR});}
  const validated=validateWaitlistInput(parsed);
  if(!validated.ok)return json(400,{ok:false,message:WAITLIST_INVALID,fields:validated.fields});
  if(validated.honeypot)return success();
  if(!deps.databaseConfigured)return json(503,{ok:false,message:WAITLIST_UNAVAILABLE});
  const userAgent=request.headers.get('user-agent');
  await deps.insert({email:validated.signup.email,source:WAITLIST_SOURCE,userAgentHash:userAgent?.trim()?sha256(userAgent):null});
  return success();
 }catch{return json(503,{ok:false,message:WAITLIST_UNAVAILABLE});}
}
