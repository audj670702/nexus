export function initAccountMenu(){
  const trigger=document.querySelector("#btnAccount"),menu=document.querySelector("#accountMenu");
  if(!trigger||!menu)return;
  const close=()=>{menu.hidden=true;trigger.setAttribute("aria-expanded","false")};
  trigger.addEventListener("click",e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;trigger.setAttribute("aria-expanded",String(open))});
  menu.addEventListener("click",e=>{const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;document.dispatchEvent(new CustomEvent("nexus:navigation",{detail:{action}}));close()});
  document.addEventListener("click",e=>{if(!menu.hidden&&!menu.contains(e.target)&&e.target!==trigger)close()});
}