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
    ]}]},
    {start:'0.6.4',end:'0.6.7',entries:[{version:'0.6.4',changes:[
      '댓글 공감·비공감 명단에 인장 색상과 명단별 통계 추가'
    ]},{version:'0.6.5',changes:[
      '검증 실패 시 자동 재시도를 최대 2회로 제한하고 마지막 실패 30분 후 재개',
      '보고 있지 않은 탭의 새 검증 요청을 중지하고 탭으로 돌아오면 재개'
    ]},{version:'0.6.6',summary:[
      "댓글 '공감 확인' 명단 통계 추가",
      '노인장 중복 집계 오류 수정',
      '게시글 화면의 통계 패널은 댓글만 집계하도록 변경',
      '페이지 이동 시 사용성 개선'
    ],changes:[
      '하단 통계 패널에서 같은 닉네임을 한 명으로 집계하도록 수정',
      '새 설치 기본값을 모든 색상 게시글·댓글 표시 및 통계 패널 꺼짐으로 변경',
      '게시글 상세화면의 통계 패널은 하단 게시글 목록을 제외하고 댓글 작성자만 집계하도록 변경',
      '전체 탭의 진행·대기 닉네임 한도를 100명에서 20명으로 조정',
      '페이지 이동 시 대기열 포화가 검증 실패로 처리되어 판정이 지연되던 문제 수정',
      '페이지 이동 시 불필요한 대기 작업을 정리하고 현재 페이지를 우선 검증하도록 개선',
      '뒤로가기로 복원된 페이지에서 남은 닉네임 검증이 재개되지 않던 문제 수정',
      '삭제된 댓글 안내가 노인장으로 표시되고 통계에 포함되던 문제 수정'
    ]},{version:'0.6.7',summary:[
      "댓글 '공감 확인' 명단 통계 추가",
      '노인장 중복 집계 오류 수정',
      '게시글 화면의 통계 패널은 댓글만 집계하도록 변경',
      '페이지 이동 시 사용성 개선'
    ],changes:['정상 검증 캐시를 6시간·최대 4만 명으로 확대하고 용량 기준 자동 정리 추가']}]}
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
