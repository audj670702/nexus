import {getContext,setContext,clearContext} from "./context.js";

const SYS_AUTH_URL="https://www.scad.mx/sys-autenticacion";
const SYS_CONTEXT_URL="https://www.scad.mx/_functions/nexusPwaContext";
const SESSION_KEY="nexus.sys.context";

function normalizeSysContext(result={}){
  const usuario=result?.usuario||{};
  return {
    authenticated:true,
    memberId:usuario.memberId||"",
    email:usuario.email||"",
    user:usuario,
    eo:result?.eo||null,
    roles:Array.isArray(usuario.roles)?usuario.roles:[],
    modules:[],
    auth:result?.auth||null,
    actividades:Array.isArray(result?.actividades)?result.actividades:[],
    documentos:Array.isArray(result?.documentos)?result.documentos:[],
    tv:result?.tv||null
  };
}

function saveSessionContext(context){
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(context))}catch(_){}
}

function restoreSessionContext(){
  try{
    const raw=sessionStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed?.authenticated===true?parsed:null;
  }catch(_){return null}
}

function removeSysAuthFromUrl(){
  const url=new URL(window.location.href);
  if(!url.searchParams.has("sysAuth"))return;
  url.searchParams.delete("sysAuth");
  window.history.replaceState({},"",url.toString());
}

async function exchangeSysAuth(sysAuth){
  const url=new URL(SYS_CONTEXT_URL);
  url.searchParams.set("sysAuth",sysAuth);

  const response=await fetch(url.toString(),{
    method:"GET",
    mode:"cors",
    cache:"no-store",
    credentials:"omit",
    headers:{"Accept":"application/json"}
  });

  let result=null;
  try{result=await response.json()}catch(_){}

  if(!response.ok||!result?.ok){
    throw new Error(result?.mensaje||`No fue posible resolver el contexto NEXUS (HTTP ${response.status}).`);
  }

  const context=setContext(normalizeSysContext(result));
  saveSessionContext(context);
  return context;
}

export async function resolveAccessContext(){
  const url=new URL(window.location.href);
  const sysAuth=String(url.searchParams.get("sysAuth")||"").trim();

  if(sysAuth){
    try{
      return await exchangeSysAuth(sysAuth);
    }finally{
      removeSysAuthFromUrl();
    }
  }

  const restored=restoreSessionContext();
  if(restored)return setContext(restored);

  clearContext();
  return getContext();
}

export function startLogin(){
  const u=new URL(SYS_AUTH_URL);
  u.searchParams.set("app","NEXUS");
  u.searchParams.set("returnUrl",window.location.href);
  window.location.assign(u.toString());
}

export function logoutLocal(){
  try{sessionStorage.removeItem(SESSION_KEY)}catch(_){}
  clearContext();

  const u=new URL(SYS_AUTH_URL);
  u.searchParams.set("app","NEXUS");
  u.searchParams.set("returnUrl",window.location.origin+window.location.pathname);
  u.searchParams.set("logout","1");
  window.location.assign(u.toString());
}

export function canAccessRole(role){
  return !role||(getContext().roles||[]).includes(role);
}
