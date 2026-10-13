(() => {
  const defaults={enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'hide',black:'hide',months:3,minPower:4000,minItem:1730};
  let settings=defaults, scheduled=false;
  let submitted=0;
  const submissionLimit=100;
  const records=new Map(), users=new Map();
  const badges=new Map();
  let cacheGeneration=0;
  let panel,summary;
  let stopped=false,observer,scanTimer,expiryTimer,storageListener;
  function contextValid(){try{return !stopped&&!!chrome.runtime?.id;}catch{return false;}}
  function deactivate(){
    if(stopped)return;stopped=true;
    observer?.disconnect();clearTimeout(scanTimer);clearInterval(expiryTimer);
    for(const [el] of records)el.classList.remove('ivpf-hidden');
    for(const {dot} of badges.values())dot.remove();
    panel?.remove();document.body?.classList.remove('ivpf-active');
    try{if(storageListener)chrome.storage.onChanged.removeListener(storageListener);}catch{}
    records.clear();badges.clear();users.clear();
  }
  function nickOf(el) {return Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join('').replace(/\u00a0/g,' ').trim();}
  function hasIcon(scope) {
    return !!scope?.querySelector('img[src*="/i1957398161.png"]');
  }
  function add(el,nick,kind,icon) {
    if(!el || !nick) return;
    const old=records.get(el);
    if(old && old.nick===nick && old.kind===kind && old.icon===icon) return;
    records.set(el,{nick,kind,icon});
  }
  function scan() {
    if(!contextValid()){deactivate();return;}
    scheduled=false;
    for(const [el] of records) if(!el.isConnected) records.delete(el);
    document.querySelectorAll('td.user').forEach(cell=>{
      const row=cell.closest('tr');if(!row?.querySelector('a.subject-link')) return;
      const name=cell.querySelector('.layerNickName')||cell;
      add(row,nickOf(name),'posts',hasIcon(cell));badge(name,nickOf(name),hasIcon(cell));
    });
    document.querySelectorAll('.commentList1 li .nickname,.commentList1 li .-c-nickname').forEach(n=>{add(n.closest('li'),nickOf(n),'comments',hasIcon(n));badge(n,nickOf(n),hasIcon(n));});
    const writer=document.querySelector('.articleWriter [onclick*="layerNickName"]');
    if(writer) {
      const nick=nickOf(writer);
      badge(writer,nick,null);
      // The detail header does not render a game authentication icon.
      // null means no icon signal on this surface: query the actual profile.
      document.querySelectorAll('.articleSubject,.articleContent').forEach(el=>add(el,nick,'posts',null));
    }
    // Badges also verify users when the hide filter is switched off.
    // Detail author and comments precede the lower-page article list.
    const ordered=Array.from(records.entries()).sort(([a,ra],[b,rb])=>{
      const rank=(el,r)=>r.icon===null?0:r.kind==='comments'?1:2;
      return rank(a,ra)-rank(b,rb);
    });
    for(const [,{nick,icon}] of ordered) if(settings.enabled && icon!==false) check(nick);
    render();
  }
  function badge(name,nick,icon) {
    let dot=badges.get(name)?.dot;
    if(!dot || !dot.isConnected){dot=document.createElement('span');dot.className='ivpf-dot';name.prepend(dot);}
    badges.set(name,{dot,nick,icon});
  }
  function check(nick) {
    if(!contextValid()){deactivate();return;}
    const current=users.get(nick);
    if(current && (current.state==='pending'||current.expires>Date.now())) return;
    if(submitted>=submissionLimit) return;
    submitted++;
    const generation=cacheGeneration;
    users.set(nick,{state:'pending'});
    Promise.resolve().then(()=>chrome.runtime.sendMessage({type:'verify',nick})).then(result=>{
      if(stopped)return;
      if(generation!==cacheGeneration) return;
      if(result?.state==='cancelled') {users.delete(nick);return;}
      users.set(nick,result||{state:'error',expires:Date.now()+30000});render();
    }).catch(e=>{if(!contextValid()||/Extension context invalidated/i.test(e?.message||'')){deactivate();return;}if(generation!==cacheGeneration)return;users.set(nick,{state:'error',expires:Date.now()+30000});render();})
      .finally(()=>{submitted--;schedule();});
  }
  function render() {
    if(stopped)return;
    document.body?.classList.toggle('ivpf-active',settings.enabled);
    if(panel) panel.style.display=settings.enabled?'':'none';
    for(const {dot} of badges.values()) dot.hidden=!settings.enabled;
    if(!settings.enabled) {
      for(const [el] of records) el.classList.remove('ivpf-hidden');
      return;
    }
    const stateOf=r=>{
      if(r.icon===false) return 'unverified';
      const result=users.get(r.nick);
      if(result?.state==='verified'&&result.metrics) return globalThis.ivpfRating.assess(result.metrics,Date.now(),settings).state;
      return result?.state||'pending';
    };
    const colorOf=state=>state==='verified'?'green':state==='warning'?'yellow':state==='unverified'?'red':'black';
    const labels={verified:'인증 프로필 공개 · 기준 충족',warning:'인증 프로필 공개 · 주의 기준 해당',unknown:'인증 프로필 확인됨 · 일부 기준 확인 불가',unverified:'인증마크 없음 또는 인증 프로필 없음',pending:'검증 대기',error:'검증 실패'};
    const counts={green:0,yellow:0,red:0,black:0};
    for(const [name,r] of badges){
      if(!name.isConnected){badges.delete(name);continue;}
      const result=users.get(r.nick);
      let state=r.icon===false?'unverified':(result?.state||'pending');
      const rating=state==='verified'&&result.metrics?globalThis.ivpfRating.assess(result.metrics,Date.now(),settings):null;
      if(rating) state=rating.state;
      counts[colorOf(state)]++;
      const label=state==='warning'
        ? rating.reasons.join(' · ')
        : [labels[state]||labels.error,...(rating?.reasons||[]),...(rating?.unknown||[])].join(' · ');
      r.dot.dataset.state=state;r.dot.title=label;r.dot.setAttribute('aria-label',label);r.dot.setAttribute('role','img');
    }
    for(const [el,r] of records) {
      const state=stateOf(r);
      const hide=settings[r.kind] && settings[colorOf(state)]==='hide';
      el.classList.toggle('ivpf-hidden',!!hide);
    }
    if(summary) for(const color of Object.keys(counts)) summary.querySelector('[data-count="'+color+'"]').textContent=counts[color].toLocaleString('ko-KR');
  }
  function schedule(){if(stopped)return;if(!scheduled){scheduled=true;scanTimer=setTimeout(scan,120);}}
  async function start() {
    const stored=await chrome.storage.local.get(null);
    if(!contextValid()){deactivate();return;}
    settings=globalThis.ivpfSettings.normalize(stored.settings);
    cacheGeneration=stored.cacheGeneration||0;
    for(const [key,value] of Object.entries(stored)) {
      if(key.startsWith('profile:')&&value?.schema===5&&value.expires>Date.now()) users.set(key.slice(8),value);
    }
    panel=document.createElement('aside');panel.id='ivpf-panel';
    const header=document.createElement('div');header.className='ivpf-panel-header';
    const title=document.createElement('strong');title.textContent='로벤 인장 필터';header.append(title);
    const openSettings=document.createElement('button');openSettings.className='ivpf-settings';openSettings.textContent='⚙';openSettings.title='설정 열기';openSettings.setAttribute('aria-label','설정 열기');
    openSettings.onclick=async event=>{
      if(!event.isTrusted)return;
      openSettings.disabled=true;
      try{const result=await chrome.runtime.sendMessage({type:'openSettings'});if(!result?.ok)openSettings.title=result?.reason||'Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.';}
      catch(e){if(!contextValid())deactivate();else openSettings.title='Chrome 도구 모음의 확장 아이콘으로 설정을 열어주세요.';}
      finally{openSettings.disabled=false;}
    };header.append(openSettings);panel.append(header);
    summary=document.createElement('div');summary.className='ivpf-counts';
    for(const [color,label] of Object.entries({green:'인장',yellow:'가라인장',red:'노인장',black:'대기·실패'})) {
      const cell=document.createElement('div'),dot=document.createElement('span'),number=document.createElement('span');
      dot.className='ivpf-count-dot '+color;number.dataset.count=color;number.className='ivpf-count-number';
      cell.append(dot,document.createTextNode(label),number);summary.append(cell);
    }
    summary.title='현재 페이지의 닉네임 표시 수입니다. 같은 사용자도 여러 번 표시되면 중복 집계됩니다. 회색에는 일부 정보 확인 불가도 포함됩니다.';panel.append(summary);
    const retry=document.createElement('button');retry.textContent='인장 검증 새로고침';
    retry.onclick=async event=>{
      if(!event.isTrusted)return;
      retry.disabled=true;
      try{const result=await chrome.runtime.sendMessage({type:'clear'});if(result?.ok){render();schedule();}}
      catch(e){if(!contextValid()||/Extension context invalidated/i.test(e?.message||''))deactivate();else retry.title='새로고침에 실패했습니다. 잠시 후 다시 시도해주세요.';}
      finally{retry.disabled=false;}
    };panel.append(retry);
    document.body.append(panel);
    observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>!panel.contains(m.target))) schedule();
    });observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['onclick','src']});
    storageListener=(changes,area)=>{
      if(!contextValid()){deactivate();return;}
      if(area!=='local') return;
      if(changes.settings) settings=globalThis.ivpfSettings.normalize(changes.settings.newValue);
      if(changes.cacheGeneration) {cacheGeneration=changes.cacheGeneration.newValue;users.clear();}
      for(const key of Object.keys(changes)) if(key.startsWith('profile:')) {
        const nick=key.slice(8);if(changes[key].newValue?.schema===5) users.set(nick,changes[key].newValue);else users.delete(nick);
      }
      // Apply visibility preferences immediately, without waiting for a rescan
      // or a new verification request to complete.
      render();
      schedule();
    };chrome.storage.onChanged.addListener(storageListener);
    scan();if(!stopped)expiryTimer=setInterval(()=>{if(!document.hidden)schedule();},15000);
  }
  const initialize=()=>start().catch(()=>deactivate());
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();

