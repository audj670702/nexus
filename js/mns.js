import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';
import { functions } from 'https://esm.sh/@wix/http-functions@1.0.0';
import { getContext } from './context.js';

// NEXUS · Integración MNS SYS · v1.0.1
// Traslado funcional del módulo MNS de SCaD Comunidad.
// No modifica contratos, acciones, colecciones ni estructura MNS SYS.
const CHANNEL='MNS_FRONTEND';
const FRAME_URL='./mns-frontend-v052.html?v=0.5.17';
const CLIENT_ID='8943652e-6424-4b27-961b-9486abcc97b7';
const SITE_ID='e9c5ce53-8342-4146-acd9-3468abb10cb0';
const REDIRECT_URI='https://nexus.scad.mx/';
const TOKEN_KEY='nexus_mns_tokens';
const PKCE_KEY='nexus_mns_pkce';
const PENDING_KEY='nexus_mns_pending';
const MNS_KEY='MNS-E8WRQH8ZCZ8Z';
let activeContext=null;

function readTokens(){try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')}catch{return null}}
function saveTokens(t){localStorage.setItem(TOKEN_KEY,JSON.stringify({...t,savedAt:Date.now()}))}
function sdkTokens(t){if(!t?.access_token||!t?.refresh_token)return null;const savedAt=Number(t.savedAt||Date.now());const expiresIn=Number(t.expires_in||14400);return{accessToken:{value:t.access_token,expiresAt:savedAt+(expiresIn*1000)},refreshToken:{value:t.refresh_token,role:'member'}}}
function randomString(n=64){const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,b=>(b%36).toString(36)).join('')}
function b64url(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function challenge(v){return b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))}
async function tokenRequest(body){const r=await fetch('https://www.wixapis.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`OAuth token ${r.status}`);return r.json()}
async function anonymousToken(){return tokenRequest({clientId:CLIENT_ID,grantType:'anonymous'})}
async function refreshTokens(refreshToken){const t=await tokenRequest({clientId:CLIENT_ID,grantType:'refresh_token',refreshToken});saveTokens(t);return t}
async function accessToken(){let t=readTokens();if(!t)return'';const age=(Date.now()-(t.savedAt||0))/1000;if(t.access_token&&age<Math.max(60,(t.expires_in||3600)-120))return t.access_token;if(t.refresh_token){t=await refreshTokens(t.refresh_token);return t.access_token||''}return''}

async function startMnsLogin(){
  const verifier=randomString(72),state=randomString(32),codeChallenge=await challenge(verifier);
  sessionStorage.setItem(PKCE_KEY,JSON.stringify({verifier,state}));
  sessionStorage.setItem(PENDING_KEY,'1');
  const anon=await anonymousToken();
  const r=await fetch('https://www.wixapis.com/headless/v1/redirect-session',{method:'POST',headers:{'Content-Type':'application/json','Authorization':anon.access_token},body:JSON.stringify({auth:{authRequest:{clientId:CLIENT_ID,responseType:'code',redirectUri:REDIRECT_URI,scope:'offline_access',state,responseMode:'query',codeChallenge,codeChallengeMethod:'S256',metaSiteId:SITE_ID},prompt:'login'},preferences:{useGenericWixPages:true}})});
  if(!r.ok)throw new Error(`OAuth redirect ${r.status}`);
  const data=await r.json(),url=data?.redirectSession?.fullUrl;
  if(!url)throw new Error('Wix no devolvió URL de autenticación.');
  location.assign(url);
}
async function consumeCallback(){
  const p=new URLSearchParams(location.search),code=p.get('code'),error=p.get('error');
  if(error)throw new Error(`Autenticación Wix: ${error}`);
  if(!code)return false;
  const raw=sessionStorage.getItem(PKCE_KEY);if(!raw)return false;
  const pkce=JSON.parse(raw);if(p.get('state')!==pkce.state)throw new Error('Estado OAuth inválido.');
  const t=await tokenRequest({clientId:CLIENT_ID,grantType:'authorization_code',redirectUri:REDIRECT_URI,code,codeVerifier:pkce.verifier});
  saveTokens(t);sessionStorage.removeItem(PKCE_KEY);
  const clean=new URL(location.href);clean.searchParams.delete('code');clean.searchParams.delete('state');clean.searchParams.delete('error');clean.searchParams.delete('error_description');
  history.replaceState({},document.title,clean.pathname+clean.search+clean.hash);
  return true;
}

function resolveMnsContext(ctx){
  if(ctx?.authenticated!==true)throw new Error('Inicia sesión en NEXUS para usar Mensajería.');
  const eoKey=String(ctx?.eo?.codigoEO||'').trim().toUpperCase();
  if(!eoKey)throw new Error('NEXUS no recibió codigoEO del Ente Operador activo.');
  return {mnsKey:MNS_KEY,eoKey};
}
async function validateMnsAccess(){
  const init=await invokeMns('mnsInit',{});
  const appId=String(init?.appId||'').trim();
  const eoId=String(init?.eoId||'').trim();
  if(!appId||!eoId)throw new Error('MNS no devolvió el contexto APP/EO resuelto.');
  activeContext={...activeContext,mnsResolved:{appId,eoId}};
  return init;
}
function ensureStyles(){if(document.getElementById('nexusMnsStyles'))return;const s=document.createElement('style');s.id='nexusMnsStyles';s.textContent=`.nexus-mns-overlay{position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);display:flex;align-items:stretch;justify-content:center}.nexus-mns-panel{width:100%;height:100%;background:#f6f8fb;overflow:hidden}.nexus-mns-frame{display:block;width:100%;height:100%;border:0;background:#f6f8fb}body.nexus-mns-open{overflow:hidden}@media(min-width:760px){.nexus-mns-overlay{padding:28px;align-items:center}.nexus-mns-panel{width:min(1040px,calc(100vw - 56px));height:min(820px,calc(100dvh - 56px));border-radius:22px;box-shadow:0 24px 80px rgba(6,31,57,.28)}}`;document.head.appendChild(s)}
function frame(){return document.querySelector('#nexusMnsOverlay iframe')}
function closeMns(){document.getElementById('nexusMnsOverlay')?.remove();document.body.classList.remove('nexus-mns-open')}
async function invokeMns(action,payload={}){
  const token=await accessToken();if(!token)throw new Error('Inicia sesión para usar Mensajería.');
  const tokens=sdkTokens(readTokens());if(!tokens)throw new Error('La sesión Wix de Mensajería no es válida.');
  const client=createClient({modules:{functions},auth:OAuthStrategy({clientId:CLIENT_ID,siteId:SITE_ID,tokens})});
  const ctx=resolveMnsContext(activeContext);
  const response=await client.functions.post('mnsBridge',{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,...ctx}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||`MNS no respondió (${response.status}).`);
  if(data?.ok!==true)throw new Error(data?.error||'No fue posible completar la operación.');
  return data.data;
}
async function openMns(ctx=null){
  try{
    activeContext=ctx||getContext();
    resolveMnsContext(activeContext);
    if(!await accessToken()){await startMnsLogin();return}
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
(async()=>{try{const consumed=await consumeCallback();if(consumed&&sessionStorage.getItem(PENDING_KEY)==='1'){sessionStorage.removeItem(PENDING_KEY);setTimeout(()=>openMns(),500)}}catch(e){console.error('[NEXUS MNS OAuth]',e)}})();
