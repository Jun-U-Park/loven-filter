(() => {
  const defaults={enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'show',black:'show',months:3,minPower:4000,minItem:1730};
  let settings=defaults, scheduled=false;
  let submitted=0;
  let queueBlockedUntil=0,queueRetryTimer;
  const submissionLimit=20;
  let pagePort,pageReady=false,pageToken,sessionSerial=0,pageSuspended=false,reconnectTimer;
  let restoreSequence=0;
  let demands=new Map();
  const records=new Map(), users=new Map();
  const badges=new Map();
  let cacheGeneration=0;
  let panel,summary;
  let stopped=false,observer,scanTimer,expiryTimer,storageListener;
  function contextValid(){try{return !stopped&&!!chrome.runtime?.id;}catch{return false;}}
  function deactivate(){
    if(stopped)return;stopped=true;restoreSequence++;
    observer?.disconnect();clearTimeout(scanTimer);clearInterval(expiryTimer);
    clearTimeout(queueRetryTimer);
    clearTimeout(reconnectTimer);
    document.removeEventListener('visibilitychange',visibilityChanged);
    window.removeEventListener('pagehide',pageHidden);window.removeEventListener('pageshow',pageShown);
    try{pagePort?.disconnect();}catch{}
    for(const [el] of records)el.classList.remove('ivpf-hidden');
    for(const {dot} of badges.values())dot.remove();
    document.querySelectorAll('.ivpf-recommend-counts').forEach(el=>el.remove());
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
    for(const [el,r] of records) if(!el.isConnected||(r.kind==='comments'&&el.matches('li.preDelCmt'))) {
      el.classList.remove('ivpf-hidden');records.delete(el);
    }
    for(const [name,r] of badges)if(r.kind==='comments'&&name.closest('li.preDelCmt')){
      r.dot.remove();badges.delete(name);
    }
    document.querySelectorAll('td.user').forEach(cell=>{
      const row=cell.closest('tr');if(!row?.querySelector('a.subject-link')) return;
      const name=cell.querySelector('.layerNickName')||cell;
      add(row,nickOf(name),'posts',hasIcon(cell));badge(name,nickOf(name),hasIcon(cell));
    });
    document.querySelectorAll('.mo-board-list li.list').forEach(row=>{
      if(!row.querySelector('a.contentLink')) return;
      const scope=row.querySelector('.user_info .nick');
      const name=scope?.querySelector('.layerNickName')||scope;
      if(!name) return;
      const nick=nickOf(name),icon=hasIcon(scope);
      add(row,nick,'posts',icon);badge(name,nick,icon);
    });
    document.querySelectorAll('.commentList1 li .nickname,.commentList1 li .-c-nickname').forEach(n=>{
      const row=n.closest('li'),nick=nickOf(n);
      // Inven puts a deletion notice in the nickname slot of preDelCmt rows.
      if(!row||row.classList.contains('preDelCmt')||!nick)return;
      add(row,nick,'comments',hasIcon(n));badge(n,nick,hasIcon(n),false,'comments');
    });
    const writer=document.querySelector('.articleWriter [onclick*="layerNickName"],.mo-board-view #article-writer > span');
    if(writer) {
      const nick=nickOf(writer);
      badge(writer,nick,null);
      // The detail header does not render a game authentication icon.
      // null means no icon signal on this surface: query the actual profile.
      document.querySelectorAll('.articleSubject,#articleSubject,.articleContent').forEach(el=>add(el,nick,'posts',null));
    }
    // Recommendation rows have no auth-icon signal. Only query an open list.
    const recommendationCells=new Set(),commentRecommendationCells=new Set();
    document.querySelectorAll('.recomList').forEach(list=>{
      const isArticle=list.id==='recom_article';
      // Best comments and ordinary comments use separate voter containers.
      if(!isArticle&&!/^recom_(?:true)?cmt\d+$/.test(list.id)) return;
      const cells=isArticle?recommendationCells:commentRecommendationCells;
      if(!list.getClientRects().length||getComputedStyle(list).visibility==='hidden') return;
      list.querySelectorAll('table tr').forEach(row=>{
        const cell=row.querySelector('td:first-child');
        if(!cell||!row.getClientRects().length) return;
        const nick=nickOf(cell);if(!nick) return;
        cells.add(cell);badge(cell,nick,null,true);
      });
    });
    for(const [name,r] of badges) if(r.recommendation&&!recommendationCells.has(name)&&!commentRecommendationCells.has(name)) {
      r.dot.remove();badges.delete(name);
    }
    // Badges also verify users when the hide filter is switched off.
    // Detail author and comments precede the lower-page article list.
    const ordered=Array.from(records.entries()).sort(([a,ra],[b,rb])=>{
      const rank=(el,r)=>r.icon===null?0:r.kind==='comments'?1:2;
      return rank(a,ra)-rank(b,rb);
    });
    demands=new Map();
    const want=(nick,rank)=>{if(!demands.has(nick)&&demands.size<5000)demands.set(nick,rank);};
    for(const [,{nick,icon,kind}] of ordered)if(icon!==false)want(nick,icon===null?0:kind==='comments'?1:2);
    for(const cell of recommendationCells)want(badges.get(cell).nick,3);
    for(const cell of commentRecommendationCells)want(badges.get(cell).nick,4);
    publishPage();
    for(const [,{nick,icon}] of ordered) if(settings.enabled && icon!==false) check(nick);
    if(settings.enabled) {
      // The worker uses document visibility and these ranks to select queued
      // work. Already running jobs finish and remain shared across pages.
      for(const cells of [recommendationCells,commentRecommendationCells])
        for(const cell of cells) check(badges.get(cell).nick);
    }
    render();
  }
  function badge(name,nick,icon,recommendation=false,kind='posts') {
    let dot=badges.get(name)?.dot;
    if(!dot || !dot.isConnected){dot=document.createElement('span');dot.className='ivpf-dot';name.prepend(dot);}
    badges.set(name,{dot,nick,icon,recommendation,kind});
  }
  function check(nick) {
    if(!contextValid()){deactivate();return;}
    if(document.hidden)return;
    if(typeof chrome.runtime.connect==='function'&&!pageReady)return;
    if(pageSuspended||!demands.has(nick))return;
    if(Date.now()<queueBlockedUntil)return;
    const current=users.get(nick);
    if(current && (current.state==='pending'||current.expires>Date.now())) return;
    if(submitted>=submissionLimit) return;
    submitted++;
    const generation=cacheGeneration;
    const serial=sessionSerial;
    users.set(nick,{state:'pending'});
    Promise.resolve().then(()=>document.hidden||pageSuspended||serial!==sessionSerial?{state:'cancelled'}:chrome.runtime.sendMessage({type:'verify',nick,...(pagePort?{pageToken}:{})})).then(result=>{
      if(stopped)return;
      if(generation!==cacheGeneration||serial!==sessionSerial) return;
      if(result?.state==='cancelled') {users.delete(nick);return;}
      if(result?.state==='busy') {
        // Capacity contention is pending, not a failed profile lookup.
        users.delete(nick);queueBlockedUntil=Date.now()+1000;
        clearTimeout(queueRetryTimer);
        queueRetryTimer=setTimeout(()=>{if(!document.hidden&&settings.enabled)schedule();},1000);
        render();return;
      }
      users.set(nick,result||{state:'error',expires:Date.now()+30000});render();
    }).catch(e=>{if(!contextValid()||/Extension context invalidated/i.test(e?.message||'')){deactivate();return;}if(generation!==cacheGeneration||serial!==sessionSerial)return;users.set(nick,{state:'error',expires:Date.now()+30000});render();})
      .finally(()=>{if(serial===sessionSerial)submitted--;schedule();});
  }
  function render() {
    if(stopped)return;
    document.body?.classList.toggle('ivpf-active',settings.enabled);
    if(panel) {
      panel.style.display=settings.enabled&&settings.panelVisible?'':'none';
      panel.dataset.position=settings.panelPosition;
    }
    for(const {dot} of badges.values()) dot.hidden=!settings.enabled;
    document.querySelectorAll('.ivpf-recommend-counts').forEach(el=>el.hidden=!settings.enabled);
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
    const panelUsers=new Map();
    const detailPage=!!document.querySelector('.articleWriter,.articleSubject,#articleSubject,.articleContent,.mo-board-view');
    if(summary)summary.title=detailPage
      ?'현재 게시글의 댓글 작성자를 닉네임별로 한 명씩 집계합니다. 본문 작성자·하단 게시글 목록·추천 및 공감 명단은 제외합니다. 회색에는 일부 정보 확인 불가도 포함됩니다.'
      :'게시글 목록의 작성자를 닉네임별로 한 명씩 집계합니다. 추천·비공감 명단은 제외합니다. 회색에는 일부 정보 확인 불가도 포함됩니다.';
    const recommendationCounts=new Map();
    for(const [name,r] of badges){
      if(!name.isConnected){badges.delete(name);continue;}
      const result=users.get(r.nick);
      let state=r.icon===false?'unverified':(result?.state||'pending');
      const rating=state==='verified'&&result.metrics?globalThis.ivpfRating.assess(result.metrics,Date.now(),settings):null;
      if(rating) state=rating.state;
      // Count each nickname once across posts, comments and best comments.
      // Prefer a surface that can verify the profile over a missing icon.
      if(!r.recommendation){
        if((!detailPage||r.kind==='comments')&&(!panelUsers.has(r.nick)||r.icon!==false))panelUsers.set(r.nick,r);
      }
      else {
        const table=name.closest('table');
        if(table){
          if(!recommendationCounts.has(table)) recommendationCounts.set(table,new Map());
          recommendationCounts.get(table).set(r.nick,colorOf(state));
        }
      }
      const label=state==='warning'
        ? rating.reasons.join(' · ')
        : [labels[state]||labels.error,...(rating?.reasons||[]),...(rating?.unknown||[])].join(' · ');
      r.dot.dataset.state=state;r.dot.title=label;r.dot.setAttribute('aria-label',label);r.dot.setAttribute('role','img');
    }
    for(const r of panelUsers.values())counts[colorOf(stateOf(r))]++;
    for(const [table,nicks] of recommendationCounts){
      const heading=table.querySelector('th');if(!heading) continue;
      let totals=heading.querySelector('.ivpf-recommend-counts');
      if(!totals){
        totals=document.createElement('span');totals.className='ivpf-recommend-counts';
        const total=document.createElement('span'),totalLabel=document.createElement('span'),totalNumber=document.createElement('span');
        total.className='ivpf-recommend-total';totalLabel.textContent='합계';totalNumber.dataset.recommendTotal='';
        total.append(totalLabel,totalNumber);totals.append(total);
        for(const [color,label] of Object.entries({green:'인장',yellow:'가라인장',red:'노인장',black:'대기·실패·일부 정보 확인 불가'})){
          const item=document.createElement('span'),dot=document.createElement('i'),number=document.createElement('span');
          item.title=label;item.className='ivpf-recommend-group';dot.className='ivpf-recommend-dot';dot.dataset.color=color;dot.setAttribute('aria-hidden','true');
          number.dataset.recommendCount=color;item.append(dot,number);totals.append(item);
        }
        heading.append(totals);
      }
      totals.hidden=false;
      const values={green:0,yellow:0,red:0,black:0};
      for(const color of nicks.values()) values[color]++;
      const totalNumber=totals.querySelector('[data-recommend-total]'),totalText=nicks.size.toLocaleString('ko-KR');
      if(totalNumber.textContent!==totalText) totalNumber.textContent=totalText;
      for(const [color,value] of Object.entries(values)){
        const number=totals.querySelector('[data-recommend-count="'+color+'"]'),text=value.toLocaleString('ko-KR');
        if(number.textContent!==text) number.textContent=text;
      }
      totals.setAttribute('aria-label',`합계 ${nicks.size}명, 인장 ${values.green}명, 가라인장 ${values.yellow}명, 노인장 ${values.red}명, 대기·실패 ${values.black}명`);
    }
    document.querySelectorAll('.ivpf-recommend-counts').forEach(el=>{
      if(!recommendationCounts.has(el.closest('table'))) el.remove();
    });
    for(const [el,r] of records) {
      const state=stateOf(r);
      const hide=settings[r.kind] && settings[r.kind+'_'+colorOf(state)]==='hide';
      el.classList.toggle('ivpf-hidden',!!hide);
    }
    if(summary) for(const color of Object.keys(counts)) summary.querySelector('[data-count="'+color+'"]').textContent=counts[color].toLocaleString('ko-KR');
  }
  function schedule(){if(stopped)return;if(!scheduled){scheduled=true;scanTimer=setTimeout(scan,120);}}
  function publishPage(){
    if(!pagePort)return;
    try{pagePort.postMessage({type:'page',token:pageToken,visible:!document.hidden&&!pageSuspended&&settings.enabled,demands:[...demands]});}
    catch{dropPageConnection();if(!pageSuspended&&!stopped)reconnectTimer=setTimeout(connectPage,1000);}
  }
  function dropPageConnection(){
    const port=pagePort;pagePort=null;pageReady=false;pageToken=undefined;
    sessionSerial++;submitted=0;queueBlockedUntil=0;
    clearTimeout(reconnectTimer);clearTimeout(queueRetryTimer);
    for(const [nick,value] of users)if(value.state==='pending')users.delete(nick);
    // Chrome does not fire onDisconnect on the end that calls disconnect().
    // Reset our own state before closing; do not rely on that event for restore.
    try{port?.disconnect();}catch{}
  }
  function connectPage(){
    if(stopped||pageSuspended||pagePort||typeof chrome.runtime.connect!=='function')return;
    try{
      const port=chrome.runtime.connect({name:'ivpf-page'});pagePort=port;pageToken=crypto.randomUUID();pageReady=false;
      port.onMessage.addListener(msg=>{if(port===pagePort&&msg?.type==='ready'&&!pageReady){pageReady=true;schedule();}});
      port.onDisconnect.addListener(()=>{
        // Read lastError to avoid an unchecked disconnection warning.
        try{void chrome.runtime.lastError;}catch{}
        if(port!==pagePort)return;dropPageConnection();
        if(!contextValid()){deactivate();return;}
        if(!pageSuspended)reconnectTimer=setTimeout(()=>{connectPage();schedule();},1000);
      });
      publishPage();
    }catch{if(!contextValid())deactivate();else reconnectTimer=setTimeout(connectPage,1000);}
  }
  function pageHidden(){
    restoreSequence++;pageSuspended=true;publishPage();dropPageConnection();
    clearTimeout(scanTimer);scheduled=false;
  }
  async function pageShown(event){
    if(stopped)return;
    if(!pageSuspended&&!event?.persisted){connectPage();publishPage();schedule();return;}
    const restore=++restoreSequence;pageSuspended=true;dropPageConnection();
    clearTimeout(scanTimer);scheduled=false;
    // Storage changes can be missed while a document is frozen in back/forward cache.
    try{
      const stored=await chrome.storage.local.get(null);
      if(stopped||restore!==restoreSequence)return;
      settings=globalThis.ivpfSettings.normalize(stored.settings);cacheGeneration=stored.cacheGeneration||0;
      users.clear();
      for(const [key,value] of Object.entries(stored))
        if(key.startsWith('profile:')&&value?.schema===5&&value.expires>Date.now())users.set(key.slice(8),value);
    }catch{if(!contextValid()){deactivate();return;}}
    if(stopped||restore!==restoreSequence)return;
    pageSuspended=false;connectPage();publishPage();render();schedule();
  }
  function visibilityChanged(){publishPage();if(!document.hidden){connectPage();schedule();}}
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
    summary.title='현재 페이지의 게시글·댓글에 표시된 사용자를 닉네임별로 한 명씩 집계합니다. 추천·비공감 명단은 제외합니다. 회색에는 일부 정보 확인 불가도 포함됩니다.';panel.append(summary);
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
      if(mutations.some(m=>!panel.contains(m.target)&&
        (m.type!=='attributes'||m.attributeName!=='class'||
          (m.oldValue||'').replace(/\bivpf-(?:active|hidden)\b/g,'').trim()!==
          (m.target.getAttribute('class')||'').replace(/\bivpf-(?:active|hidden)\b/g,'').trim()))) schedule();
    });observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['onclick','src','style','hidden','class']});
    storageListener=(changes,area)=>{
      if(!contextValid()){deactivate();return;}
      if(area!=='local') return;
      if(changes.settings) settings=globalThis.ivpfSettings.normalize(changes.settings.newValue);
      if(changes.cacheGeneration) {cacheGeneration=changes.cacheGeneration.newValue;users.clear();queueBlockedUntil=0;}
      for(const key of Object.keys(changes)) if(key.startsWith('profile:')) {
        const nick=key.slice(8);if(changes[key].newValue?.schema===5) users.set(nick,changes[key].newValue);else users.delete(nick);
        // A completed verification normally frees a global queue slot.
        if(changes[key].newValue)queueBlockedUntil=0;
      }
      // Apply visibility preferences immediately, without waiting for a rescan
      // or a new verification request to complete.
      render();
      schedule();
    };chrome.storage.onChanged.addListener(storageListener);
    document.addEventListener('visibilitychange',visibilityChanged);
    window.addEventListener('pagehide',pageHidden);window.addEventListener('pageshow',pageShown);
    connectPage();
    scan();if(!stopped)expiryTimer=setInterval(()=>{if(!document.hidden)schedule();},15000);
  }
  const initialize=()=>start().catch(()=>deactivate());
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();

