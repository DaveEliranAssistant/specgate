// Best-effort limiter for one server instance. A fresh instance starts empty,
// which is the safe degradation for serverless: it shares no state and stores no raw IP.
export function createRateLimiter({limit,windowMs}){
 const hits=new Map();
 return function takeToken(key,now){
  const recent=(hits.get(key)??[]).filter(stamp=>now-stamp<windowMs);
  if(recent.length>=limit){hits.set(key,recent);return {allowed:false};}
  recent.push(now);hits.set(key,recent);
  if(hits.size>5000)for(const [stored,stamps] of hits)if(stamps.every(stamp=>now-stamp>=windowMs))hits.delete(stored);
  return {allowed:true};
 };
}
export const waitlistRateLimit=createRateLimiter({limit:5,windowMs:10*60*1000});
