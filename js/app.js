import {resolveAccessContext,startLogin,logoutLocal} from "./auth.js";
import {initAccountMenu} from "./navigation.js";
import {BASIC_MODULES,renderModules} from "./modules.js";
import {initTv} from "./tv.js";
const VERSION="0.2.1";
function initials(name=""){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"N"}
function paintContext(c){
  const auth=c?.authenticated===true;
  const login=document.querySelector("#btnLogin"),account=document.querySelector("#btnAccount");
  login.hidden=auth;account.hidden=!auth;
  if(!auth){
    document.querySelector("#contextTitle").textContent="Explora NEXUS";
    document.querySelector("#contextMeta").textContent="Inicia sesión para acceder a tus recursos operativos.";
    document.querySelector("#eoName").textContent="Información pública";
    document.querySelector("#eoChannelName").textContent="EO";
    document.querySelector("#btnAdminPanel").hidden=true;
    return;
  }
  const name=c?.user?.nombreVisible||c?.user?.nombre||"Usuario",email=c?.email||c?.user?.email||"",eo=c?.eo?.nombreMostrar||c?.eo?.nombre||"EO";
  document.querySelector("#contextTitle").textContent=name;
  document.querySelector("#contextMeta").textContent=email;
  document.querySelector("#eoName").textContent=eo;
  document.querySelector("#eoChannelName").textContent=eo;
  for(const id of ["#topUserName","#menuUserName"])document.querySelector(id).textContent=name;
  document.querySelector("#menuUserEmail").textContent=email;
  for(const id of ["#topAvatar","#menuAvatar"])document.querySelector(id).textContent=initials(name);
  document.querySelector("#btnAdminPanel").hidden=!(c?.roles||[]).includes("ADM");
}
async function boot(){
  initAccountMenu();initTv();
  const c=await resolveAccessContext();
  paintContext(c);renderModules(document.querySelector("#modulesGrid"),BASIC_MODULES,c);
  document.querySelector("#btnLogin").addEventListener("click",startLogin);
  document.addEventListener("nexus:navigation",e=>{if(e.detail?.action==="logout")logoutLocal()});
  document.querySelector(".footer>span:first-child").textContent=`NEXUS · v${VERSION}`;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
}
boot().catch(console.error);