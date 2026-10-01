import {getContext,setContext,clearContext} from "./context.js";

const SYS_AUTH_URL="https://www.scad.mx/sys-autenticacion";
const SYS_CONTEXT_URL="https://www.scad.mx/_functions/nexusPwaContext";
const SESSION_KEY="nexus.sys.context";
const TOKEN_KEY="nexus.sys.token";
const AUTH_REDIRECT_KEY="nexus.sys.authRedirectAt";
const AUTH_REDIRECT_COOLDOWN_MS=2*60*1000;

function trace(stage,detail={}){
  console.info(`NEXUS | SYS AUT | ${stage}`,detail);
}

// =====================================================
// TOKEN FIRMADO SYS (paso 3b)
// sys-autenticacion entrega el token en el fragmento: #t=<token>
// Se guarda en sessionStorage y se envía como Authorization: Bearer.
// =====================================================
function decodeTokenExp(token){
  try{
    const part=String(token||"").split(".")[1]||"";
    const json=atob(part.replace(/-/g,"+").replace(/_/g,"/"));
    return Number(JSON.parse(json)?.exp)||0;
  }catch(_){return 0}
}

function captureTokenFromHash(){
  const hash=String(window.location.hash||"");
  const match=/(?:^#|&)t=([^&]+)/.exec(hash);
  if(!match)return false;
  const token=decodeURIComponent(match[1]);
  try{
    sessionStorage.setItem(TOKEN_KEY,token);
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  }catch(error){
    console.warn("NEXUS | SYS AUT | TOKEN_SAVE_ERROR",error);
  }
  const url=new URL(window.location.href);
  url.hash="";
  window.history.replaceState({},"",url.toString());
  trace("TOKEN_RECEIVED",{exp:decodeTokenExp(token)||null});
  return true;
}

function clearToken(){
  try{sessionStorage.removeItem(TOKEN_KEY)}catch(_){}
}

export function getAuthToken(){
  let token="";
  try{token=String(sessionStorage.getItem(TOKEN_KEY)||"")}catch(_){token=""}
  if(!token)return "";
  const exp=decodeTokenExp(token);
  if(exp&&Date.now()/1000>exp){
    trace("TOKEN_EXPIRED",{exp});
    clearToken();
    return "";
  }
  return token;
}

// Agrega Authorization: Bearer <token> a los headers de una petición al backend SYS.
export function authHeaders(headers={}){
  const token=getAuthToken();
  return token?{...headers,Authorization:`Bearer ${token}`}:{...headers};
}

// El backend respondió 401 (token ausente, inválido o vencido): volver a iniciar sesión.
// Con freno para no entrar en un ciclo de redirecciones.
export function handleAuthRequired(){
  let last=0;
  try{last=Number(sessionStorage.getItem(AUTH_REDIRECT_KEY)||0)}catch(_){}
  if(last&&Date.now()-last<AUTH_REDIRECT_COOLDOWN_MS){
    trace("AUTH_REQUIRED_SKIPPED",{reason:"COOLDOWN"});
    return false;
  }
  try{
    sessionStorage.setItem(AUTH_REDIRECT_KEY,String(Date.now()));
    sessionStorage.removeItem(SESSION_KEY);
  }catch(_){}
  clearToken();
  clearContext();
  trace("AUTH_REQUIRED_REDIRECT");
  startLogin();
  return true;
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
    informes:result?.informes||result?.reports||null,
    app:result?.app||null,
    actividades:Array.isArray(result?.actividades)?result.actividades:(Array.isArray(result?.programacion)?result.programacion:[]),
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

function removeAuthContextFromUrl(){
  const url=new URL(window.location.href);
  const params=["memberId","enteOperador","codigoContexto"];
  const hasAuthContext=params.some(param=>url.searchParams.has(param));
  if(!hasAuthContext)return;
  params.forEach(param=>url.searchParams.delete(param));
  window.history.replaceState({},"",url.toString());
}

async function resolveMemberContext(memberId,enteOperador=""){
  trace("NEXUS_CONTEXT_REQUEST",{
    endpoint:SYS_CONTEXT_URL,
    memberIdPresent:Boolean(memberId),
    enteOperadorPresent:Boolean(enteOperador)
  });

  // La identidad la da el token; memberId/enteOperador sólo se envían por compatibilidad.
  const url=new URL(SYS_CONTEXT_URL);
  if(memberId)url.searchParams.set("memberId",memberId);
  if(enteOperador)url.searchParams.set("enteOperador",enteOperador);

  const response=await fetch(url.toString(),{
    method:"GET",
    mode:"cors",
    cache:"no-store",
    credentials:"omit",
    headers:authHeaders({"Accept":"application/json"})
  });

  if(response.status===401){
    handleAuthRequired();
  }

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
  removeAuthContextFromUrl();

  trace("NEXUS_CONTEXT_OK",{
    memberId:context.memberId,
    eo:context?.eo?.codigoEO||context?.eo?.nombreMostrar||context?.eo?.nombre||null,
    roles:context.roles
  });

  return context;
}

export async function resolveAccessContext(){
  const tokenRecibido=captureTokenFromHash();
  const url=new URL(window.location.href);
  const memberId=String(url.searchParams.get("memberId")||"").trim();
  const enteOperador=String(url.searchParams.get("enteOperador")||"").trim();

  // Regreso del login: basta con el token (#t=); memberId en la URL ya no es necesario.
  if(tokenRecibido||memberId){
    trace("MEMBER_RETURN_RECEIVED",{
      tokenPresent:tokenRecibido,
      memberIdPresent:Boolean(memberId),
      enteOperadorPresent:Boolean(enteOperador)
    });
    return resolveMemberContext(memberId,enteOperador);
  }

  const restored=restoreSessionContext();
  if(restored){
    trace("SESSION_CONTEXT_RESTORED",{
      memberId:restored.memberId||null,
      roles:Array.isArray(restored.roles)?restored.roles:[]
    });
    return setContext(restored);
  }

  trace("VISITOR_CONTEXT",{reason:"MEMBER_ID_NOT_PRESENT"});
  clearContext();
  return getContext();
}

export function startLogin(){
  const returnUrl=new URL(window.location.href);
  returnUrl.searchParams.delete("memberId");
  returnUrl.searchParams.delete("enteOperador");
  returnUrl.searchParams.delete("codigoContexto");
  returnUrl.searchParams.delete("sysAuth");

  const u=new URL(SYS_AUTH_URL);
  u.searchParams.set("app","NEXUS");
  u.searchParams.set("returnUrl",returnUrl.toString());

  trace("LOGIN_REDIRECT",{app:"NEXUS",returnUrl:returnUrl.toString()});
  window.location.assign(u.toString());
}

export function logoutLocal(){
  try{sessionStorage.removeItem(SESSION_KEY)}catch(_){}
  clearToken();
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
