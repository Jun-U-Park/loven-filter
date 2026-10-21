(() => {
  const token=crypto.randomUUID();
  let dialog,timer,busy=false,stopped=false;
  function stop(){
    stopped=true;clearInterval(timer);dialog?.remove();
    try{chrome.storage.onChanged.removeListener(changed);}catch{}
    document.removeEventListener('visibilitychange',check);
    window.removeEventListener('pagehide',stop);
  }
  function changed(changes,area){if(area==='local'&&changes.updateNoticeSeen)stop();}
  async function check(){
    if(stopped||busy)return;
    if(document.hidden){dialog?.remove();dialog=null;return;}
    busy=true;
    try{
      const result=await chrome.runtime.sendMessage({type:'claimUpdateNotice',token});
      if(result?.done){stop();return;}
      if(!result?.version){if(result?.busy){dialog?.remove();dialog=null;}return;}
      if(dialog)return;
      dialog=globalThis.ivpfReleaseNotes.show(result.version,async()=>{
        const result=await chrome.runtime.sendMessage({type:'ackUpdateNotice',token});
        if(result?.ok||result?.done){stop();return true;}
        return false;
      });
    }catch(error){try{if(!chrome.runtime?.id||/Extension context invalidated/i.test(error?.message||''))stop();}catch{stop();}}
    finally{busy=false;}
  }
  chrome.storage.onChanged.addListener(changed);
  document.addEventListener('visibilitychange',check);
  window.addEventListener('pagehide',stop);
  function start(){timer=setInterval(check,30000);check();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
