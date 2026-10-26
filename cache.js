export const cacheLimits=Object.freeze({ttl:6*60*60*1000,profiles:40000,softBytes:7*1024*1024,targetBytes:6*1024*1024});
// A conservative UTF-8 estimate, including key names. Chrome's actual quota
// measurement can differ; leave space and recover separately from quota errors.
const encoder=new TextEncoder();
export function entryBytes(key,value){return encoder.encode(key+JSON.stringify(value)).length;}
export function planCacheCleanup(data,{now=Date.now(),reserveBytes=0,maxProfiles=cacheLimits.profiles,validRetry=()=>true,pressure=false}={}){
 const remove=new Set(),profiles=[];let bytes=0;
 for(const [key,value] of Object.entries(data)){
  if(key.startsWith('profile:')){
   if(!value||value.schema!==5||!Number.isFinite(value.expires)||value.expires<=now){remove.add(key);continue;}
   profiles.push({key,value,bytes:entryBytes(key,value)});
  }else if(key.startsWith('retry:')&&!validRetry(value)){remove.add(key);continue;}
  bytes+=entryBytes(key,value);
 }
 profiles.sort((a,b)=>(b.value.checked||0)-(a.value.checked||0));
 for(const item of profiles.splice(maxProfiles)){remove.add(item.key);bytes-=item.bytes;}
 if(pressure||bytes+reserveBytes>cacheLimits.softBytes){
  const target=pressure?Math.min(cacheLimits.targetBytes,Math.floor(bytes*.8)):cacheLimits.targetBytes;
  while(profiles.length&&bytes+reserveBytes>target){
   const item=profiles.pop();remove.add(item.key);bytes-=item.bytes;
  }
 }
 return {remove:[...remove],bytes,sizes:new Map(profiles.map(item=>[item.key,item.bytes]))};
}
