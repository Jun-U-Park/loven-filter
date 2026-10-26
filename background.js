import {identity,hasLostarkProfile,classify,Queue,trustedSender,validNickname} from './core.js';
import {cacheLimits,entryBytes,planCacheCleanup} from './cache.js';
const queue=new Queue(5,500),inFlight=new Map(),controllers=new Set();
const pages=new Map(),jobs=new Map();let visibleOrder=0;
const ORIGIN='https://www.inven.co.kr',INVENTORY='/member/inventory/view_inventory.php',PROFILE='/common/gameprofile/index.php';
let epoch=0,cooldown=0,lastClear=0,lastCleanup=0;
let writes=Promise.resolve();
let cacheSizes=null,cacheBytes=0;
const cancelled=()=>({state:'cancelled',reason:'중단된 검증',expires:Date.now()+1000});
const error=reason=>({state:'error',reason,checked:Date.now(),expires:Date.now()+30000,schema:5});
const retryWindow=1800000,maxFailures=3;
function retryHistory(value){
 return Number.isInteger(value?.failures)&&value.failures>0&&value.failures<=maxFailures&&
  Number.isFinite(value.lastFailure)&&value.lastFailure<=Date.now()&&value.lastFailure+retryWindow>Date.now()?value:null;
}
function mutate(task){const next=writes.then(task,task);writes=next.catch(()=>{});return next;}
function stop(){epoch++;queue.cancelPending(cancelled());for(const controller of controllers)controller.abort();inFlight.clear();jobs.clear();}
function priority(job){
 let best=job.legacy?0:Infinity;
 for(const token of job.owners){
  const page=pages.get(token),rank=page?.demands.get(job.nick);
  if(page?.visible&&rank!==undefined)best=Math.min(best,-page.order*10+rank);
 }
 return best;
}
function discardQueued(job){
 const removed=queue.cancelWhere(item=>item.options.tag===job,cancelled());
 if(removed.length&&jobs.get(job.nick)===job){jobs.delete(job.nick);inFlight.delete(job.nick);}
}
function reconcilePage(token){
 const page=pages.get(token);
 for(const job of jobs.values()){
  if(job.owners.has(token)&&(!page?.visible||!page.demands.has(job.nick)))job.owners.delete(token);
  if(!job.started&&!job.legacy&&!job.owners.size)discardQueued(job);
 }
 queue.pump();
}
// A connection belongs to one document, so navigation/close detaches its work.
chrome.runtime.onConnect?.addListener(port=>{
 if(port.name!=='ivpf-page'||!trustedSender(port.sender,chrome.runtime.id,true)){port.disconnect();return;}
 let token;
 port.onMessage.addListener(msg=>{
  if(msg?.type!=='page'||typeof msg.token!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(msg.token)||
    typeof msg.visible!=='boolean'||!Array.isArray(msg.demands)||msg.demands.length>5000)return;
  if(token&&token!==msg.token)return;
  if(!token){if(pages.has(msg.token))return;token=msg.token;pages.set(token,{sender:port.sender,visible:false,order:0,demands:new Map()});}
  const page=pages.get(token);if(!page)return;
  if(msg.visible&&!page.visible)page.order=++visibleOrder;
  page.visible=msg.visible;
  page.demands=new Map(msg.demands.filter(item=>Array.isArray(item)&&validNickname(item[0])&&Number.isInteger(item[1])&&item[1]>=0&&item[1]<=4));
  reconcilePage(token);
  try{port.postMessage({type:'ready'});}catch{}
 });
 port.onDisconnect.addListener(()=>{
  // Chrome supplies lastError on the receiving end when BFCache closes a
  // channel. Consume it inside this callback before it expires, then perform
  // the same document/job cleanup regardless of the disconnect reason.
  try{void chrome.runtime.lastError;}catch{}
  if(token){pages.delete(token);reconcilePage(token);}
 });
});
function pageFor(token,sender){
 const page=pages.get(token),owner=page?.sender;
 return page&&owner.tab.id===sender.tab.id&&owner.frameId===sender.frameId&&owner.url===sender.url&&
   (!owner.documentId||owner.documentId===sender.documentId)?page:null;
}
async function request(url,options={},generation=epoch){
 const target=new URL(url),method=options.method||'GET';
 if(target.origin!==ORIGIN||!((target.pathname===INVENTORY&&method==='GET')||(target.pathname===PROFILE&&method==='POST')))throw Error('허용되지 않은 조회 주소');
 if(generation!==epoch)throw Error('cancelled');
 if(Date.now()<cooldown)throw Error('요청 제한으로 잠시 대기 중');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);controllers.add(controller);
 try{
  const response=await fetch(target.href,{...options,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
  if(response.status===429){cooldown=Date.now()+60000;for(const other of controllers)if(other!==controller)other.abort();}
  if(!response.ok)throw Error('HTTP '+response.status);
  const max=target.pathname===INVENTORY?1048576:2097152;
  if(Number(response.headers?.get('content-length'))>max)throw Error('조회 응답 크기 제한 초과');
  if(!response.body){const text=await response.text();if(new TextEncoder().encode(text).length>max)throw Error('조회 응답 크기 제한 초과');return text;}
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max){await reader.cancel();throw Error('조회 응답 크기 제한 초과');}text+=decoder.decode(chunk.value,{stream:true});}return text+decoder.decode();}
  finally{reader.releaseLock();}
 }finally{clearTimeout(timer);controllers.delete(controller);}
}
async function cleanup(options={}){
 const data=await chrome.storage.local.get(null);
 const plan=planCacheCleanup(data,{...options,validRetry:retryHistory});
 if(plan.remove.length)await chrome.storage.local.remove(plan.remove);
 cacheSizes=plan.sizes;cacheBytes=plan.bytes;lastCleanup=Date.now();
}
async function prepareCache(key,value){
 const reserve=entryBytes(key,value)+1024;
 if(!cacheSizes||Date.now()-lastCleanup>60000||cacheBytes+reserve>cacheLimits.softBytes||
   (!cacheSizes.has(key)&&cacheSizes.size>=cacheLimits.profiles))
  await cleanup({reserveBytes:reserve,maxProfiles:cacheLimits.profiles-1});
}
async function saveProfile(key,result,generation){
 if(generation!==epoch)return false;
 try{await chrome.storage.local.set({[key]:result});}
 catch(e){
  if(!/quota|QUOTA_BYTES|storage.*(?:full|exceed)/i.test(String(e?.message||e)))throw e;
  // Settings and valid retry histories are never sacrificed to cache capacity.
  await cleanup({pressure:true,reserveBytes:entryBytes(key,result)+1024,maxProfiles:cacheLimits.profiles-1});
  if(generation!==epoch)return false;
  try{await chrome.storage.local.set({[key]:result});}catch{return false;}
 }
 cacheBytes+=entryBytes(key,result)-(cacheSizes?.get(key)||0)+512;
 cacheSizes?.set(key,entryBytes(key,result));return true;
}
async function verify(nick,token,sender){
 const page=token?pageFor(token,sender):null;
 if(token&&(!page?.visible||!page.demands.has(nick)))return cancelled();
 const key='profile:'+nick,retryKey='retry:'+nick;
 const stored=await chrome.storage.local.get([key,retryKey,'settings']);
 if(!globalThis.ivpfSettings.normalize(stored.settings).enabled)return cancelled();
 // The document can disappear while reading storage.
 if(token&&(pages.get(token)!==page||!page.visible||!page.demands.has(nick)))return cancelled();
 const saved=stored[key];
 const history=retryHistory(stored[retryKey]);
 if(history?.failures===maxFailures)return {...error('자동 재시도 한도 도달 · 마지막 실패 30분 후 재개'),failures:history.failures,expires:history.lastFailure+retryWindow,cached:true};
 if(saved?.schema===5&&saved.expires>Date.now()&&['verified','unverified','error'].includes(saved.state))return {...saved,cached:true};
 if(inFlight.has(nick)){
  const existing=jobs.get(nick);if(token)existing?.owners.add(token);else if(existing)existing.legacy=true;
  queue.pump();return inFlight.get(nick);
 }
 const job={nick,owners:new Set(token?[token]:[]),legacy:!token,started:false};
 if(inFlight.size>=20){
  // Make room for the current page by dropping only lower-priority queued work.
  const victim=[...jobs.values()].filter(item=>!item.started&&priority(item)>priority(job)).sort((a,b)=>priority(b)-priority(a))[0];
  if(victim)discardQueued(victim);
  if(inFlight.size>=20)return {state:'busy',reason:'검증 대기열 대기',retryAfter:1000};
 }
 const generation=epoch;
 const promise=queue.run(async()=>{
  job.started=true;
  let result;
  try{
   if(generation!==epoch)return cancelled();
   const settings=(await chrome.storage.local.get('settings')).settings;
   if(!globalThis.ivpfSettings.normalize(settings).enabled)return cancelled();
   // A global server cooldown is not another failed attempt by this user.
   if(Date.now()<cooldown)return {...error('요청 제한으로 잠시 대기 중'),expires:cooldown};
   const html=await request(ORIGIN+INVENTORY+'?'+new URLSearchParams({nick,site:'lostark'}),{},generation);
   const memid=identity(html,nick);
   if(typeof memid!=='string'||memid.length>256||/[\u0000-\u001f\u007f]/.test(memid))throw Error('회원 식별자 형식 오류');
   if(!hasLostarkProfile(html))result={state:'unverified',reason:'인장에 로아 프로필 항목이 없음'};
   else{
    const raw=await request(ORIGIN+PROFILE,{method:'POST',body:new URLSearchParams({mode:'view',game:'lostark',memid,memnick:nick})},generation);
    const data=JSON.parse(raw);result={state:classify(data),reason:''};
    if(result.state==='verified'){
     const value=key=>typeof data.profileData[key]==='string'?data.profileData[key].slice(0,64):null;
     result.metrics={updated:value('update_date'),power:value('CombatPower'),item:value('ItemAvgLevel')};
    }
   }
   result.checked=Date.now();result.expires=result.checked+cacheLimits.ttl;result.schema=5;
  }catch(e){if(generation!==epoch)return cancelled();result=error(String(e.message).slice(0,120));}
  if(generation!==epoch)return cancelled();
  await mutate(async()=>{
   if(generation!==epoch)return;
   await prepareCache(key,result);
   if(generation!==epoch)return;
   if(result.state==='error'){
    const data=await chrome.storage.local.get(retryKey);
    const previous=retryHistory(data[retryKey]);
    const failures=Math.min(maxFailures,(previous?.failures||0)+1),lastFailure=result.checked;
    result.failures=failures;
    if(failures===maxFailures){result.expires=lastFailure+retryWindow;result.reason+=' · 자동 재시도 한도 도달, 마지막 실패 30분 후 재개';}
    await chrome.storage.local.set({[retryKey]:{failures,lastFailure}});
   }else await chrome.storage.local.remove([retryKey]);
   if(generation!==epoch)return;
   // A rejected cache write does not turn a successful network lookup gray.
   await saveProfile(key,result,generation);
  });
  return generation===epoch?result:cancelled();
 },{tag:job,priority:()=>priority(job)}).finally(()=>{
  if(inFlight.get(nick)===promise)inFlight.delete(nick);
  if(jobs.get(nick)===job)jobs.delete(nick);
 });
 jobs.set(nick,job);inFlight.set(nick,promise);return promise;
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!msg||typeof msg!=='object'||!trustedSender(sender,chrome.runtime.id))return false;
 if(['claimUpdateNotice','ackUpdateNotice'].includes(msg.type)&&trustedSender(sender,chrome.runtime.id,true)&&typeof msg.token==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(msg.token)){
  mutate(async()=>{
   const version=chrome.runtime.getManifest().version;
   const data=await chrome.storage.local.get(['updateNoticePending','updateNoticeSeen','updateNoticeLease']);
   if(data.updateNoticePending!==version||data.updateNoticeSeen===version)return {done:true};
   const lease=data.updateNoticeLease,owns=lease?.version===version&&lease.tab===sender.tab.id&&lease.token===msg.token;
   if(msg.type==='ackUpdateNotice'){
    if(!owns)return {ok:false};
    await chrome.storage.local.set({updateNoticeSeen:version,updateNoticePending:null,updateNoticeLease:null});return {ok:true,done:true};
   }
   if(!owns&&lease?.version===version&&lease.expires>Date.now())return {busy:true};
   await chrome.storage.local.set({updateNoticeLease:{version,tab:sender.tab.id,token:msg.token,expires:Date.now()+90000}});
   return {version};
  }).then(reply,()=>reply({error:true}));return true;
 }
 if(msg.type==='openSettings'&&trustedSender(sender,chrome.runtime.id,true)){
  if(typeof chrome.action?.openPopup!=='function'){reply({ok:false,reason:'Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.'});return false;}
  const options=Number.isInteger(sender.tab.windowId)?{windowId:sender.tab.windowId}:{};
  Promise.resolve().then(()=>chrome.action.openPopup(options)).then(()=>reply({ok:true}),()=>reply({ok:false,reason:'Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.'}));return true;
 }
 if(msg.type==='verify'&&trustedSender(sender,chrome.runtime.id,true)&&validNickname(msg.nick)){
  if(msg.pageToken!==undefined&&(typeof msg.pageToken!=='string'||!pageFor(msg.pageToken,sender))){reply(cancelled());return false;}
  verify(msg.nick,msg.pageToken,sender).then(reply,()=>reply(error('검증 처리 오류')));return true;
 }
 if(msg.type==='clear'){
  if(Date.now()-lastClear<2000){reply({ok:false,reason:'잠시 후 다시 눌러주세요.'});return false;}
  lastClear=Date.now();stop();
  mutate(async()=>{
   const data=await chrome.storage.local.get(null);
   await chrome.storage.local.remove(Object.keys(data).filter(key=>key.startsWith('profile:')||key.startsWith('retry:')));
   cacheSizes=null;cacheBytes=0;
   await chrome.storage.local.set({cacheGeneration:Math.max(Date.now(),Number(data.cacheGeneration||0)+1)});
  }).then(()=>reply({ok:true}),()=>reply({ok:false,reason:'캐시 초기화 실패'}));return true;
 }
 return false;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings&&!globalThis.ivpfSettings.normalize(changes.settings.newValue).enabled)stop();});
chrome.runtime.onStartup.addListener(()=>mutate(cleanup));
chrome.runtime.onInstalled?.addListener(details=>{
 const version=chrome.runtime.getManifest().version;
 if(details.reason==='install')mutate(()=>chrome.storage.local.set({updateNoticeSeen:version,updateNoticePending:null,updateNoticeLease:null}));
 else if(details.reason==='update')mutate(async()=>{
  const stored=await chrome.storage.local.get(['updateNoticeSeen','updateNoticePending']);
  // Existing development installs may reload the same version when this feature is added.
  if(details.previousVersion!==version||(!stored.updateNoticeSeen&&!stored.updateNoticePending))
   await chrome.storage.local.set({updateNoticePending:version,updateNoticeLease:null});
 });
});
