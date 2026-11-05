import {insertWaitlistSignup} from '../lib/waitlist/db.mjs';
import {databaseUrl,handleWaitlistPost} from '../lib/waitlist/handle.mjs';
import {WAITLIST_UNAVAILABLE} from '../lib/waitlist/messages.mjs';
import {waitlistRateLimit} from '../lib/waitlist/rate-limit.mjs';
export function GET(){
 if(!databaseUrl())return Response.json({available:false,message:WAITLIST_UNAVAILABLE},{status:503});
 return Response.json({available:true});
}
export function POST(request){
 return handleWaitlistPost(request,{databaseConfigured:Boolean(databaseUrl()),insert:insertWaitlistSignup,takeToken:waitlistRateLimit});
}
