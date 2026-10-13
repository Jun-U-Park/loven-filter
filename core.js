import './rating.js';
import './settings.js';
export const defaults = {enabled:true, posts:true, comments:true, green:'show', yellow:'show', red:'hide', black:'hide', months:3, minPower:4000, minItem:1730};
export function identity(html, nick) {
  const decode = s => s.replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const modern = html.match(/\bdata-common-data="([^"]+)"/);
  if (modern) {
    const d = JSON.parse(decode(modern[1]));
    if(d.mode !== 'view' || d.m_nicname !== nick || !d.uniqueMemberCode) throw Error('identity');
    return d.uniqueMemberCode;
  }
  const tag = html.match(/<div\b[^>]*class="inventory-section[^>]*>/);
  if(tag) {
    const attr = name => decode(tag[0].match(new RegExp(name+'="([^"]*)"'))?.[1] || '');
    if(attr('data-mode') === 'view' && attr('data-charnick') === nick && attr('data-charid')) return attr('data-charid');
  }
  throw Error('인장 구조 또는 작성자 식별자를 확인하지 못했습니다');
}
export function hasLostarkProfile(html) {
  const modern=html.match(/\bdata-common-data="([^"]+)"/);
  if(modern) {
    const data=JSON.parse(modern[1].replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&amp;/g,'&'));
    const state=data.myAuthGameList?.lostark;
    return state===1||state==='1'||state===true;
  }
  // Legacy inventories render their tabs directly in the response HTML.
  const tabs=html.match(/<ul\b[^>]*class="tabs\b[^>]*>([\s\S]*?)<\/ul>/);
  if(!tabs) throw Error('인장 메뉴 구조를 확인하지 못했습니다');
  return /<button\b[^>]*data-id="(?:game_profile|lostark)"[^>]*>\s*(?:로아|로스트아크)(?:\s|<)/.test(tabs[1]);
}
export function classify(data) {
  if(data?.result !== true || !data.profileData || typeof data.profileData !== 'object') throw Error('게임 프로필 조회 실패');
  const p = data.profileData;
  if(p.auth_state === false || p.auth_state === 0 || p.auth_state === '0') return 'unverified';
  if(p.auth_state === true || p.auth_state === 1 || p.auth_state === '1') {
    if(typeof p.CharacterClassName === 'string' && p.CharacterClassName.trim() && typeof p.ItemAvgLevel === 'string' && p.ItemAvgLevel.trim()) return 'verified';
  }
  throw Error('알 수 없는 게임 프로필 응답');
}
export class Queue {
  constructor(limit=2, gap=350) {this.limit=limit;this.gap=gap;this.active=0;this.jobs=[];this.next=0;this.timer=null;}
  run(task) {return new Promise((resolve,reject)=>{this.jobs.push({task,resolve,reject});this.pump();});}
  cancelPending(value) {
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    for(const job of this.jobs.splice(0))job.resolve(value);
  }
  pump() {
    if(this.timer || this.active>=this.limit || !this.jobs.length) return;
    const wait=Math.max(0,this.next-Date.now());
    if(wait) {this.timer=setTimeout(()=>{this.timer=null;this.pump();},wait);return;}
    const job=this.jobs.shift();this.active++;this.next=Date.now()+this.gap;
    Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{this.active--;this.pump();});this.pump();
  }
}
export function trustedSender(sender,extensionId,boardOnly=false) {
  if(sender?.id!==extensionId || typeof sender.url!=='string') return false;
  try {
    const url=new URL(sender.url);
    if(sender.tab) return sender.frameId===0 && url.origin==='https://www.inven.co.kr' && /^\/board\/lostark\/\d+(?:\/\d+)?\/?$/.test(url.pathname);
    return !boardOnly && url.href===`chrome-extension://${extensionId}/popup.html`;
  }catch{return false;}
}
export function validNickname(nick) {
  return typeof nick==='string'&&nick.length>0&&nick.length<=80&&nick===nick.trim()&&!/[\u0000-\u001f\u007f-\u009f]/.test(nick);
}


