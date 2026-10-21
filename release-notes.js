globalThis.ivpfReleaseNotes={
  show(version,onConfirm=async()=>true){
    const existing=document.getElementById('ivpf-update-notice');
    if(existing)return existing;
    const dialog=document.createElement('dialog');dialog.id='ivpf-update-notice';
    const title=document.createElement('h2');title.textContent=`로벤 인장 필터가 ${version}으로 업데이트되었습니다.`;
    const heading=document.createElement('h3');heading.textContent='변경사항';
    const list=document.createElement('ol');
    for(const text of ['게시글/댓글 숨김 옵션 분리','화면 하단 통계 패널 표시/숨김 옵션 추가','게시글 내 추천 확인 시 명단 색상 및 통계 추가']){
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
