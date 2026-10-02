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
// TOKEN FIRMADO SYS · sesión persistente (v0.3.1)
// sys-autenticacion entrega el token en el fragmento: #t=<token>.
// El token y el contexto se conservan en el teléfono (localStorage), así que
// cerrar la app no cierra la sesión. Antes de vencer (8 h) se renueva en
// silencio con /nexusTokenRefresh, hasta 30 días después del login original.
// Sólo "Cerrar sesión", la desactivación del usuario o esos 30 días la terminan.
// =====================================================
const TOKEN_REFRESH_URL="https://www.scad.mx/_functions/nexusTokenRefresh";
const REFRESH_BEFORE_SEC=2*60*60;

const store={
  get(key){
    try{
      const v=localStorage.getItem(key);
      if(v!==null)return v;
      const old=sessionStorage.getItem(key); // migración desde v0.3.0
      if(old!==null){localStorage.setItem(key,old);sessionStorage.removeItem(key)}
      return old;
    }catch(_){return null}
  },
  set(key,value){try{localStorage.setItem(key,value)}catch(_){try{sessionStorage.setItem(key,value)}catch(__){}}},
  remove(key){try{localStorage.removeItem(key)}catch(_){}try{sessionStorage.removeItem(key)}catch(_){}}
};

function decodeTokenExp(token){
  try{
    const part=String(token||"").split(".")[1]||"";
    const json=atob(part.replace(/-/g,"+").replace(/_/g,"/"));
    return Number(JSON.parse(json)?.exp)||0;
  }catch(_){return 0}
}

function saveToken(token){
  store.set(TOKEN_KEY,token);
  try{sessionStorage.removeItem(AUTH_REDIRECT_KEY)}catch(_){}
}

function captureTokenFromHash(){
  const hash=String(window.location.hash||"");
  const match=/(?:^#|&)t=([^&]+)/.exec(hash);
  if(!match)return false;
  const token=decodeURIComponent(match[1]);
  saveToken(token);
  const url=new URL(window.location.href);
  url.hash="";
  window.history.replaceState({},"",url.toString());
  trace("TOKEN_RECEIVED",{exp:decodeTokenExp(token)||null});
  return true;
}

function clearToken(){store.remove(TOKEN_KEY)}
function rawToken(){return String(store.get(TOKEN_KEY)||"")}

export function getAuthToken(){
  const token=rawToken();
  if(!token)return "";
  const exp=decodeTokenExp(token);
  return exp&&Date.now()/1000>exp?"":token;
}

// Renueva el token si le quedan menos de 2 h (o si force). Una sola petición a la vez.
// Devuelve true si al terminar hay un token vigente.
let refreshing=null;
export function refreshAuthToken({force=false}={}){
  const token=rawToken();
  if(!token)return Promise.resolve(false);
  const exp=decodeTokenExp(token),now=Date.now()/1000;
  if(!force&&exp&&exp-now>REFRESH_BEFORE_SEC)return Promise.resolve(true);
  if(refreshing)return refreshing;
  refreshing=(async()=>{
    try{
      const response=await fetch(TOKEN_REFRESH_URL,{method:"POST",mode:"cors",cache:"no-store",credentials:"omit",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:"{}"});
      if(response.status===401){trace("SESSION_ENDED");clearToken();store.remove(SESSION_KEY);return false}
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.ok===true&&data.token){saveToken(String(data.token));trace("TOKEN_REFRESHED",{exp:data.exp||null});return true}
      return !!getAuthToken();
    }catch(error){
      console.warn("NEXUS | SYS AUT | TOKEN_REFRESH_ERROR",error);
      return !!getAuthToken(); // sin red: se sigue con el token actual
    }finally{refreshing=null}
  })();
  return refreshing;
}

// Al volver a la app (después de tenerla en segundo plano) se revisa el token.
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshAuthToken()});

// Agrega Authorization: Bearer <token> a los headers de una petición al backend SYS.
export function authHeaders(headers={}){
  const token=getAuthToken();
  return token?{...headers,Authorization:`Bearer ${token}`}:{...headers};
}

// El backend respondió 401: primero se intenta renovar el token en silencio.
// Devuelve "refreshed" si se puede reintentar la petición; si no, manda a iniciar sesión
// (con freno para no entrar en un ciclo de redirecciones).
export async function handleAuthRequired(){
  if(await refreshAuthToken({force:true}))return "refreshed";
  let last=0;
  try{last=Number(sessionStorage.getItem(AUTH_REDIRECT_KEY)||0)}catch(_){}
  if(last&&Date.now()-last<AUTH_REDIRECT_COOLDOWN_MS){
    trace("AUTH_REQUIRED_SKIPPED",{reason:"COOLDOWN"});
    return "skipped";
  }
  try{sessionStorage.setItem(AUTH_REDIRECT_KEY,String(Date.now()))}catch(_){}
  store.remove(SESSION_KEY);
  clearToken();
  clearContext();
  trace("AUTH_REQUIRED_REDIRECT");
  startLogin();
  return "redirected";
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
  try{store.set(SESSION_KEY,JSON.stringify(context))}catch(error){
    console.warn("NEXUS | SYS AUT | SESSION_SAVE_ERROR",error);
  }
}

function restoreSessionContext(){
  try{
    const raw=store.get(SESSION_KEY);
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
  if(restored&&rawToken()){
    // Sesión guardada en el teléfono: renovar el token si está por vencer o vencido.
    const vigente=await refreshAuthToken();
    if(vigente){
      trace("SESSION_CONTEXT_RESTORED",{
        memberId:restored.memberId||null,
        roles:Array.isArray(restored.roles)?restored.roles:[]
      });
      return setContext(restored);
    }
    trace("SESSION_EXPIRED",{memberId:restored.memberId||null});
  }else if(getAuthToken()){
    // Hay token pero no contexto guardado: pedir el contexto al backend.
    return resolveMemberContext("","");
  }
  store.remove(SESSION_KEY);

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
  store.remove(SESSION_KEY);
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
