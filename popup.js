const defaults={enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'hide',black:'hide',months:3,minPower:4000,minItem:1730};
let settings;
async function init(){
  const stored=await chrome.storage.local.get(['settings','popupDescriptionOpen','popupCriteriaOpen']);
  settings=globalThis.ivpfSettings.normalize(stored.settings);
  for(const [selector,key] of [['details.extension-description','popupDescriptionOpen'],['details.criteria:not(.extension-description)','popupCriteriaOpen']]) {
    const section=document.querySelector(selector);
    if(!section) continue;
    section.open=typeof stored[key]==='boolean'?stored[key]:true;
    let savedOpen=section.open;
    section.addEventListener('toggle',async()=>{
      if(section.open===savedOpen) return;
      const open=section.open;
      try {
        await chrome.storage.local.set({[key]:open});
        savedOpen=open;
      } catch {
        document.getElementById('status').textContent='접음·펼침 상태를 저장하지 못했습니다. 다시 시도해주세요.';
      }
    });
  }
  for(const key of Object.keys(globalThis.ivpfSettings.normalize({}))) {
    const el=document.getElementById(key);
    if(!el) continue;
    if(key==='panelPosition') {
      const buttons=el.querySelectorAll('button[data-position]');
      const update=()=>buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.position===settings.panelPosition)));
      update();
      buttons.forEach(button=>button.addEventListener('click',async()=>{
        settings.panelPosition=button.dataset.position===settings.panelPosition?(settings.panelPosition==='left'?'right':'left'):button.dataset.position;update();
        await chrome.storage.local.set({settings:{...settings}});
        document.getElementById('status').textContent='저장했습니다.';
      }));
      continue;
    }
    if(el.getAttribute('role')==='switch') {
      const isMaster=key==='enabled'||key==='posts'||key==='comments'||key==='panelVisible';
      const update=()=>{
        const show=isMaster?settings[key]===true:settings[key]==='show';
        el.setAttribute('aria-checked',String(show));
        el.title=key==='panelVisible'?(show?'통계 패널 표시':'통계 패널 숨김'):isMaster?(show?'필터 켜짐':'필터 꺼짐'):(show?'표시하기':'숨기기');
        const state=document.getElementById(key+'-state');
        if(state) state.textContent=key==='enabled'?('프로그램\n'+(show?'켜기':'끄기')):key==='panelVisible'?(show?'켜기':'끄기'):(key==='posts'||key==='comments')?(show?'필터 적용':'필터 꺼짐'):(show?'표시하기':'숨기기');
      };
      update();
      el.addEventListener('click',async()=>{
        settings[key]=isMaster?!settings[key]:(settings[key]==='show'?'hide':'show');update();
        await chrome.storage.local.set({settings:{...settings}});
        document.getElementById('status').textContent='저장했습니다.';
      });
      continue;
    }
    if(el.type==='checkbox') el.checked=settings[key];else el.value=settings[key];
    el.addEventListener('change',async()=>{
      if(el.type==='number'&&!el.checkValidity()) {
        document.getElementById('status').textContent='유효한 숫자를 입력해주세요. 갱신 기간은 1~120개월의 정수입니다.';
        el.reportValidity();return;
      }
      settings[key]=el.type==='checkbox'?el.checked:el.type==='number'?el.valueAsNumber:el.value;
      await chrome.storage.local.set({settings});document.getElementById('status').textContent='저장했습니다.';
    });
  }
  document.getElementById('view-updates').onclick=()=>{
    globalThis.ivpfReleaseNotes.show(chrome.runtime.getManifest().version);
  };
  document.getElementById('clear').onclick=async()=>{
    const result=await chrome.runtime.sendMessage({type:'clear'});document.getElementById('status').textContent=result?.ok?'캐시를 비웠습니다. 열린 게시판에서 다시 검증합니다.':result?.reason||'새로고침 실패';
  };
}
init();
