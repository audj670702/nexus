import {getContext,setContext,clearContext} from "./context.js";

const SYS_AUTH_URL="https://www.scad.mx/sys-autenticacion";
const SYS_CONTEXT_URL="https://www.scad.mx/_functions/nexusPwaContext";
const SESSION_KEY="nexus.sys.context";

function trace(stage,detail={}){
  console.info(`NEXUS | SYS AUT | ${stage}`,detail);
}

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
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(context))}catch(error){
    console.warn("NEXUS | SYS AUT | SESSION_SAVE_ERROR",error);
  }
}

function restoreSessionContext(){
  try{
    const raw=sessionStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed?.authenticated===true?parsed:null;
  }catch(error){
    console.warn("NEXUS | SYS AUT | SESSION_RESTORE_ERROR",error);
    return null;
  }
}

function removeSysAuthFromUrl(){
  const url=new URL(window.location.href);
  if(!url.searchParams.has("sysAuth"))return;
  url.searchParams.delete("sysAuth");
  window.history.replaceState({},"",url.toString());
}

async function exchangeSysAuth(sysAuth){
  trace("NEXUS_CONTEXT_REQUEST",{endpoint:SYS_CONTEXT_URL,tokenPresent:true});

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
  try{result=await response.json()}catch(error){
    console.error("NEXUS | SYS AUT | RESPONSE_JSON_ERROR",{status:response.status,error});
  }

  if(!response.ok||!result?.ok){
    const error=new Error(result?.mensaje||`No fue posible resolver el contexto NEXUS (HTTP ${response.status}).`);
    error.code=result?.code||`HTTP_${response.status}`;
    error.status=response.status;
    error.payload=result;
    throw error;
  }

  const context=setContext(normalizeSysContext(result));
  saveSessionContext(context);
  removeSysAuthFromUrl();

  trace("NEXUS_CONTEXT_OK",{
    memberId:context.memberId,
    eo:context?.eo?.codigoEO||context?.eo?.nombreMostrar||context?.eo?.nombre||null,
    roles:context.roles
  });

  return context;
}

export async function resolveAccessContext(){
  const url=new URL(window.location.href);
  const sysAuth=String(url.searchParams.get("sysAuth")||"").trim();

  if(sysAuth){
    trace("SYS_AUTH_RETURN_RECEIVED",{tokenPresent:true});
    return exchangeSysAuth(sysAuth);
  }

  const restored=restoreSessionContext();
  if(restored){
    trace("SESSION_CONTEXT_RESTORED",{
      memberId:restored.memberId||null,
      roles:Array.isArray(restored.roles)?restored.roles:[]
    });
    return setContext(restored);
  }

  trace("VISITOR_CONTEXT",{reason:"SYS_AUTH_NOT_PRESENT"});
  clearContext();
  return getContext();
}

export function startLogin(){
  const returnUrl=new URL(window.location.href);
  returnUrl.searchParams.delete("sysAuth");

  const u=new URL(SYS_AUTH_URL);
  u.searchParams.set("app","NEXUS");
  u.searchParams.set("returnUrl",returnUrl.toString());

  trace("LOGIN_REDIRECT",{app:"NEXUS",returnUrl:returnUrl.toString()});
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
