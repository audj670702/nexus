let noticeOpen=false;
const $=s=>document.querySelector(s);
export function showNotice(message,{title="NEXUS",button="Aceptar"}={}){
  const modal=$("#nexusNoticeModal"),titleEl=$("#nexusNoticeTitle"),messageEl=$("#nexusNoticeMessage"),buttonEl=$("#btnNexusNoticeAccept");
  if(!modal||!titleEl||!messageEl||!buttonEl){console.warn("NEXUS | UI NOTICE",message);return Promise.resolve()}
  titleEl.textContent=title;messageEl.textContent=String(message||"");buttonEl.textContent=button;modal.hidden=false;noticeOpen=true;buttonEl.focus();
  return new Promise(resolve=>{const close=()=>{if(!noticeOpen)return;noticeOpen=false;modal.hidden=true;buttonEl.removeEventListener("click",close);resolve()};buttonEl.addEventListener("click",close,{once:true})})
}
export function initNotices(){
  const modal=$("#nexusNoticeModal"),button=$("#btnNexusNoticeAccept");if(!modal||!button)return;
  modal.addEventListener("click",e=>{if(e.target===modal)button.click()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&noticeOpen)button.click()})
}
