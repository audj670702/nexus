import { getContext } from './context.js';

// NEXUS · Integración MNS SYS · v1.1.0
// MNS consume la autenticación/contexto ya resuelto por NEXUS; no mantiene autenticación propia.
const CHANNEL='MNS_FRONTEND';
const FRAME_URL='./mns-frontend-v052.html?v=0.5.30';
const MNS_KEY='MNS-E8WRQH8ZCZ8Z';
const BRIDGE_URL='https://www.scad.mx/_functions/mnsBridge';
let activeContext=null;

function resolveMnsContext(ctx){
  if(ctx?.authenticated!==true)throw new Error('Inicia sesión en NEXUS para usar Mensajería.');
  const eoKey=String(ctx?.eo?.codigoEO||'').trim().toUpperCase();
  if(!eoKey)throw new Error('NEXUS no recibió codigoEO del Ente Operador activo.');
  const memberId=String(ctx?.memberId||'').trim();
  if(!memberId)throw new Error('NEXUS no recibió memberId del usuario autenticado.');
  return {mnsKey:MNS_KEY,eoKey,memberId,app:'NEXUS'};
}
async function validateMnsAccess(){
  const init=await invokeMns('mnsInit',{});
  const appId=String(init?.appId||'').trim();
  const eoId=String(init?.eoId||'').trim();
  if(!appId||!eoId)throw new Error('MNS no devolvió el contexto APP/EO resuelto.');
  activeContext={...activeContext,mnsResolved:{appId,eoId},mns:{...(activeContext?.mns||{}),activo:true}};
  document.dispatchEvent(new CustomEvent('nexus:mns-active',{detail:{active:true}}));
  return init;
}
function ensureStyles(){if(document.getElementById('nexusMnsStyles'))return;const s=document.createElement('style');s.id='nexusMnsStyles';s.textContent=`.nexus-mns-overlay{position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);display:flex;align-items:stretch;justify-content:center}.nexus-mns-panel{width:100%;height:100%;background:#f6f8fb;overflow:hidden}.nexus-mns-frame{display:block;width:100%;height:100%;border:0;background:#f6f8fb}body.nexus-mns-open{overflow:hidden}@media(min-width:760px){.nexus-mns-overlay{padding:28px;align-items:center}.nexus-mns-panel{width:min(1040px,calc(100vw - 56px));height:min(820px,calc(100dvh - 56px));border-radius:22px;box-shadow:0 24px 80px rgba(6,31,57,.28)}}`;document.head.appendChild(s)}
function frame(){return document.querySelector('#nexusMnsOverlay iframe')}
function closeMns(){document.getElementById('nexusMnsOverlay')?.remove();document.body.classList.remove('nexus-mns-open')}
async function invokeMns(action,payload={}){
  const ctx=resolveMnsContext(activeContext);
  const response=await fetch(BRIDGE_URL,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({action,payload:{...payload,...ctx}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||data?.mensaje||`MNS no respondió (${response.status}).`);
  if(data?.ok!==true)throw new Error(data?.error||data?.mensaje||'No fue posible completar la operación.');
  return data.data;
}
async function openMns(ctx=null){
  try{
    activeContext=ctx||getContext();
    resolveMnsContext(activeContext);
    await validateMnsAccess();
    ensureStyles();closeMns();
    const overlay=document.createElement('div');overlay.id='nexusMnsOverlay';overlay.className='nexus-mns-overlay';
    overlay.innerHTML=`<div class="nexus-mns-panel" role="dialog" aria-modal="true" aria-label="Mensajería"><iframe class="nexus-mns-frame" src="${FRAME_URL}" title="Mensajería SCaD MNS"></iframe></div>`;
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeMns()});
    document.body.appendChild(overlay);document.body.classList.add('nexus-mns-open');
  }catch(error){console.error('[NEXUS MNS]',error);window.alert(error?.message||'No fue posible abrir Mensajería.')}
}
window.openScadMns=openMns;

document.addEventListener('click',event=>{const trigger=event.target.closest('[data-module="mns"]');if(!trigger||trigger.classList.contains('is-locked'))return;event.preventDefault();event.stopImmediatePropagation();openMns()},true);
window.addEventListener('message',async event=>{
  const f=frame();if(!f||event.source!==f.contentWindow||event.origin!==location.origin)return;
  const m=event.data;if(!m||m.channel!==CHANNEL)return;
  if(m.type==='CLOSE'){closeMns();return}
  if(m.type==='READY'){try{f.contentWindow.postMessage({channel:CHANNEL,type:'CONTEXT',payload:{appId:activeContext?.mnsResolved?.appId||'',eoId:activeContext?.mnsResolved?.eoId||''}},location.origin)}catch(e){console.error('[NEXUS MNS]',e)}return}
  if(!m.id||!m.action)return;
  try{const data=await invokeMns(m.action,m.payload||{});f.contentWindow.postMessage({channel:CHANNEL,id:m.id,ok:true,data},location.origin)}
  catch(error){f.contentWindow.postMessage({channel:CHANNEL,id:m.id,ok:false,error:error?.message||'Error MNS'},location.origin)}
});
