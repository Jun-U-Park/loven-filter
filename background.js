import {identity,hasLostarkProfile,classify,Queue,trustedSender,validNickname} from './core.js';
const queue=new Queue(10,50),inFlight=new Map(),controllers=new Set();
const ORIGIN='https://www.inven.co.kr',INVENTORY='/member/inventory/view_inventory.php',PROFILE='/common/gameprofile/index.php';
let epoch=0,cooldown=0,lastClear=0,lastCleanup=0;
let writes=Promise.resolve();
const cancelled=()=>({state:'cancelled',reason:'중단된 검증',expires:Date.now()+1000});
const error=reason=>({state:'error',reason,checked:Date.now(),expires:Date.now()+30000,schema:5});
function mutate(task){const next=writes.then(task,task);writes=next.catch(()=>{});return next;}
function stop(){epoch++;queue.cancelPending(cancelled());for(const controller of controllers)controller.abort();inFlight.clear();}
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
async function cleanup(){
 const data=await chrome.storage.local.get(null);
 const entries=Object.entries(data).filter(([key])=>key.startsWith('profile:')).sort((a,b)=>(b[1]?.checked||0)-(a[1]?.checked||0));
 await chrome.storage.local.remove(entries.filter(([,v],i)=>i>=1500||!v||v.schema!==5||!Number.isFinite(v.expires)||v.expires<Date.now()).map(([key])=>key));
}
async function verify(nick){
 const key='profile:'+nick;
 const stored=await chrome.storage.local.get([key,'settings']);
 if(!globalThis.ivpfSettings.normalize(stored.settings).enabled)return cancelled();
 const saved=stored[key];
 if(saved?.schema===5&&saved.expires>Date.now()&&['verified','unverified','error'].includes(saved.state))return {...saved,cached:true};
 if(inFlight.has(nick))return inFlight.get(nick);
 if(inFlight.size>=100)return error('검증 대기열이 가득 찼습니다. 잠시 후 재시도합니다.');
 const generation=epoch;
 const promise=queue.run(async()=>{
  let result;
  try{
   if(generation!==epoch)return cancelled();
   const settings=(await chrome.storage.local.get('settings')).settings;
   if(!globalThis.ivpfSettings.normalize(settings).enabled)return cancelled();
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
   result.checked=Date.now();result.expires=result.checked+1800000;result.schema=5;
  }catch(e){if(generation!==epoch)return cancelled();result=error(String(e.message).slice(0,120));}
  if(generation!==epoch)return cancelled();
  await mutate(async()=>{
   if(generation!==epoch)return;
   await chrome.storage.local.set({[key]:result});
   if(Date.now()-lastCleanup>60000){lastCleanup=Date.now();await cleanup();}
  });
  return generation===epoch?result:cancelled();
 }).finally(()=>{if(inFlight.get(nick)===promise)inFlight.delete(nick);});
 inFlight.set(nick,promise);return promise;
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(!msg||typeof msg!=='object'||!trustedSender(sender,chrome.runtime.id))return false;
 if(msg.type==='openSettings'&&trustedSender(sender,chrome.runtime.id,true)){
  if(typeof chrome.action?.openPopup!=='function'){reply({ok:false,reason:'Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.'});return false;}
  const options=Number.isInteger(sender.tab.windowId)?{windowId:sender.tab.windowId}:{};
  Promise.resolve().then(()=>chrome.action.openPopup(options)).then(()=>reply({ok:true}),()=>reply({ok:false,reason:'Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.'}));return true;
 }
 if(msg.type==='verify'&&trustedSender(sender,chrome.runtime.id,true)&&validNickname(msg.nick)){
  verify(msg.nick).then(reply,()=>reply(error('검증 처리 오류')));return true;
 }
 if(msg.type==='clear'){
  if(Date.now()-lastClear<2000){reply({ok:false,reason:'잠시 후 다시 눌러주세요.'});return false;}
  lastClear=Date.now();stop();
  mutate(async()=>{
   const data=await chrome.storage.local.get(null);
   await chrome.storage.local.remove(Object.keys(data).filter(key=>key.startsWith('profile:')));
   await chrome.storage.local.set({cacheGeneration:Math.max(Date.now(),Number(data.cacheGeneration||0)+1)});
  }).then(()=>reply({ok:true}),()=>reply({ok:false,reason:'캐시 초기화 실패'}));return true;
 }
 return false;
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.settings&&!globalThis.ivpfSettings.normalize(changes.settings.newValue).enabled)stop();});
chrome.runtime.onStartup.addListener(()=>mutate(cleanup));
