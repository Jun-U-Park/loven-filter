const defaults={enabled:true,posts:true,comments:true,green:'show',yellow:'show',red:'hide',black:'hide',months:3,minPower:4000,minItem:1730};
let settings;
async function init(){
  settings=globalThis.ivpfSettings.normalize((await chrome.storage.local.get('settings')).settings);
  for(const key of Object.keys(defaults)) {
    const el=document.getElementById(key);
    if(el.getAttribute('role')==='switch') {
      const isMaster=key==='enabled'||key==='posts'||key==='comments';
      const update=()=>{
        const show=isMaster?settings[key]===true:settings[key]==='show';
        el.setAttribute('aria-checked',String(show));
        el.title=isMaster?(show?'필터 켜짐':'필터 꺼짐'):(show?'표시하기':'숨기기');
        const state=document.getElementById(key+'-state');
        if(state) state.textContent=show?'표시하기':'숨기기';
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
  document.getElementById('clear').onclick=async()=>{
    const result=await chrome.runtime.sendMessage({type:'clear'});document.getElementById('status').textContent=result?.ok?'캐시를 비웠습니다. 열린 게시판에서 다시 검증합니다.':result?.reason||'새로고침 실패';
  };
}
init();
