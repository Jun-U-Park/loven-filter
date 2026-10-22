globalThis.ivpfReleaseNotes={
  // Append changes per patch version. Close a batch only for an explicitly
  // declared distribution version; start the next batch at the next version.
  batches:[
    {start:'0.6.0',end:'0.6.0',entries:[{version:'0.6.0',changes:[
      '게시글/댓글 숨김 옵션 분리','화면 하단 통계 패널 표시/숨김 옵션 추가','게시글 내 추천 확인 시 명단 색상 및 통계 추가'
    ]}]},
    {start:'0.6.1',end:'0.6.3',entries:[{version:'0.6.1',changes:[
      '로스트아크 인벤 메인 화제글의 webzine 주소에서 필터가 작동하지 않던 문제 수정',
      'PC·모바일의 로아 게시판 47개 webzine 주소 지원',
      '기존 필터 설정과 인장 검증 캐시 유지'
    ]},{version:'0.6.2',changes:[
      '동시 검증 인원을 최대 5명으로 줄이고 실제 서버 요청 간격을 최소 500ms로 조정',
      'PC·모바일 모두 로스트아크 자유게시판(6271)에서만 작동하도록 제한'
    ]},{version:'0.6.3',summary:[
      '게시글/댓글 숨김 옵션 분리',
      '화면 하단 통계 패널 표시/숨김 옵션 추가',
      '게시글 내 추천 확인 시 명단 색상 및 통계 추가',
      '로스트아크 자유게시판에서만 작동하도록 수정',
      '메인 화제글의 webzine 주소에서 필터가 작동하지 않던 문제 수정',
      '인벤 측 서버 부담을 줄이기 위한 요청 처리 방식 조정'
    ],changes:[
      '500ms 간격은 새 사용자 검증 시작에 적용하고, 같은 사용자의 인장 응답 후 게임 프로필은 추가 대기 없이 조회하도록 조정'
    ]}]}
  ],
  changesFor(version){
    const parts=value=>/^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;
    const target=parts(version);if(!target)return [];
    const compare=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
    const sameMinor=value=>value[0]===target[0]&&value[1]===target[1];
    const batch=this.batches.filter(item=>{
      const start=parts(item.start),end=item.end===null?null:parts(item.end);
      return start&&sameMinor(start)&&compare(start,target)<=0&&
        (item.end===null||(end&&compare(target,end)<=0));
    }).sort((a,b)=>compare(parts(b.start),parts(a.start)))[0];
    if(!batch)return [];
    const entries=batch.entries.filter(item=>{
      const value=parts(item.version);
      return value&&sameMinor(value)&&compare(value,parts(batch.start))>=0&&compare(value,target)<=0;
    }).sort((a,b)=>compare(parts(a.version),parts(b.version)));
    // A user-approved summary replaces earlier display text in this batch;
    // later patch entries continue accumulating after that summary.
    return [...new Set(entries.reduce((notes,item)=>item.summary?[...item.summary]:notes.concat(item.changes),[]))];
  },
  show(version,onConfirm=async()=>true){
    const existing=document.getElementById('ivpf-update-notice');
    if(existing)return existing;
    const dialog=document.createElement('dialog');dialog.id='ivpf-update-notice';
    const title=document.createElement('h2');title.textContent=`로벤 인장 필터가 ${version}으로 업데이트되었습니다.`;
    const heading=document.createElement('h3');heading.textContent='변경사항';
    const list=document.createElement('ol');
    const notes=this.changesFor(version);
    for(const text of notes){
      const item=document.createElement('li');item.textContent=text;list.append(item);
    }
    const status=document.createElement('p');status.setAttribute('role','status');
    const confirm=document.createElement('button');confirm.type='button';confirm.textContent='확인';
    confirm.addEventListener('click',async()=>{
      confirm.disabled=true;
      try{
        if(await onConfirm()!==false)dialog.remove();
        else status.textContent='확인 상태를 저장하지 못했습니다. 다시 눌러주세요.';
      }catch{status.textContent='처리하지 못했습니다. 다시 시도해주세요.';}
      finally{confirm.disabled=false;}
    });
    dialog.addEventListener('cancel',event=>event.preventDefault());
    dialog.append(title,heading,list,status,confirm);document.body.append(dialog);dialog.showModal();
    return dialog;
  }
};
