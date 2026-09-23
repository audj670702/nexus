import {getContext,setContext,clearContext} from "./context.js";

const SYS_AUTH_URL="https://www.scad.mx/sys-autenticacion";
const SYS_CONTEXT_URL="https://www.scad.mx/_functions/nexusPwaContext";
const SESSION_KEY="nexus.sys.context";
const WIX_MEMBER_URL="https://www.scad.mx/_functions/nexusWixMember";

function trace(stage,detail={}){
  console.info(`NEXUS | SYS AUT | ${stage}`,detail);
}

function normalizeSysContext(result={}){
  const usuario=result?.usuario||{};
  const member=result?.member||result?.miembro||result?.wixMember||{};
  const profile=member?.profile||result?.profile||result?.perfil||usuario?.profile||null;
  const user={...usuario,profile:profile||usuario?.profile||null};
  if(profile?.slug&&!user.slug)user.slug=profile.slug;
  if(profile?.photo&&!user.photo)user.photo=profile.photo;
  return {
    authenticated:true,
    memberId:usuario.memberId||"",
    email:usuario.email||"",
    user:user,
    eo:result?.eo||null,
    roles:Array.isArray(usuario.roles)?usuario.roles:[],
    modules:[],
    auth:result?.auth||null,
    cca:result?.cca||null,
    mns:result?.mns||result?.mensajeria||null,
    app:result?.app||null,
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

function removeMemberIdFromUrl(){
  const url=new URL(window.location.href);
  if(!url.searchParams.has("memberId"))return;
  url.searchParams.delete("memberId");
  window.history.replaceState({},"",url.toString());
}

async function enrichWixMember(context){
  const memberId=String(context?.memberId||"").trim();
  if(!memberId)return context;
  try{
    const url=new URL(WIX_MEMBER_URL);
    url.searchParams.set("memberId",memberId);
    const response=await fetch(url.toString(),{method:"GET",mode:"cors",cache:"no-store",credentials:"omit",headers:{"Accept":"application/json"}});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok||!data?.member)return context;
    const member=data.member;
    const profile=member.profile||{};
    context.member=member;
    context.profile=profile;
    context.user={...(context.user||{}),profile,slug:profile.slug||context?.user?.slug||"",photo:profile.photo||context?.user?.photo||null};
    return context;
  }catch(error){
    console.warn("NEXUS | WIX MEMBER | PROFILE_ENRICH_ERROR",error);
    return context;
  }
}

async function resolveMemberContext(memberId){
  trace("NEXUS_CONTEXT_REQUEST",{endpoint:SYS_CONTEXT_URL,memberIdPresent:true});

  const url=new URL(SYS_CONTEXT_URL);
  url.searchParams.set("memberId",memberId);

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

  const context=setContext(await enrichWixMember(normalizeSysContext(result)));
  saveSessionContext(context);
  removeMemberIdFromUrl();

  trace("NEXUS_CONTEXT_OK",{
    memberId:context.memberId,
    eo:context?.eo?.codigoEO||context?.eo?.nombreMostrar||context?.eo?.nombre||null,
    roles:context.roles
  });

  return context;
}

export async function resolveAccessContext(){
  const url=new URL(window.location.href);
  const memberId=String(url.searchParams.get("memberId")||"").trim();

  if(memberId){
    trace("MEMBER_RETURN_RECEIVED",{memberIdPresent:true});
    return resolveMemberContext(memberId);
  }

  const restored=restoreSessionContext();
  if(restored){
    trace("SESSION_CONTEXT_RESTORED",{
      memberId:restored.memberId||null,
      roles:Array.isArray(restored.roles)?restored.roles:[]
    });
    const enriched=await enrichWixMember(restored);
    saveSessionContext(enriched);
    return setContext(enriched);
  }

  trace("VISITOR_CONTEXT",{reason:"MEMBER_ID_NOT_PRESENT"});
  clearContext();
  return getContext();
}

export function startLogin(){
  const returnUrl=new URL(window.location.href);
  returnUrl.searchParams.delete("memberId");
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
