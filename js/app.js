import {resolveAccessContext,startLogin,logoutLocal} from "./auth.js";
import {initAccountMenu} from "./navigation.js";
import {BASIC_MODULES,renderModules} from "./modules.js";
import {initTv} from "./tv.js";
import "./mns.js";

const VERSION="0.2.19";

function initials(name=""){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"N"}
function firstValue(obj,keys=[]){for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return null}
function asBool(v){return v===true||v===1||v==="1"||String(v).toLowerCase()==="true"||String(v).toLowerCase()==="activo"}
function normalizeImage(v){
  if(!v)return null;
  if(typeof v==="object"){
    return normalizeImage(v.url||v.src||v.imageUrl||v.fileUrl||v.photo?.url||v.image?.url);
  }
  const s=String(v).trim();
  if(!s)return null;
  if(s.startsWith("wix:image://v1/")){
    const id=s.slice("wix:image://v1/".length).split("/")[0];
    return id?`https://static.wixstatic.com/media/${id}`:null;
  }
  return s;
}
function imageUrl(obj){
  return normalizeImage(
    firstValue(obj,["avatar","avatarUrl","foto","fotoUrl","photo","photoUrl","imagen","imagenUrl","logoEo","logoEO","logo","logoUrl","image","imageUrl"])
    ||obj?.profile?.photo||obj?.profile?.image||obj?.member?.profile?.photo
  );
}
function setAvatar(el,obj,name){
  if(!el)return;
  const url=imageUrl(obj);
  el.textContent=url?"":initials(name);
  el.style.backgroundImage=url?`url("${String(url).replace(/"/g,"%22")}")`:"";
  el.style.backgroundSize="cover";
  el.style.backgroundPosition="center";
}
function withWixReturnUrl(rawUrl){
  const url=new URL(rawUrl,window.location.href);
  url.searchParams.set("mensaje",window.location.href);
  return url.toString();
}
function getMemberAreaUrl(member,pageSlug){
  const memberSlug=String(member?.slug||"").trim();
  if(!memberSlug)return "#";
  const url=new URL(`https://www.scad.mx/members-area/${encodeURIComponent(memberSlug)}/${pageSlug}`);
  url.searchParams.set("disableScrollToTop","true");
  return withWixReturnUrl(url.toString());
}

function installedApp(c){
  if(c?.app!==null&&c?.app!==undefined){
    if(typeof c.app==="object")return asBool(firstValue(c.app,["instalada","installed","activa","activo","enabled"]));
    return asBool(c.app);
  }
  return window.matchMedia?.("(display-mode: standalone)")?.matches===true||window.navigator.standalone===true;
}
function ccaBits(c){
  const cca=c?.cca||{};
  const auth=c?.auth||{};
  const se=firstValue(cca,["Se","se","sesion","sesionWix"])??firstValue(auth,["sesionWix","session","sesion","authenticated"]);
  const us=firstValue(cca,["Us","us","usuario","usuarioActivo"])??firstValue(c?.user,["activo","active","estatus"]);
  const eo=firstValue(cca,["Eo","eo"])??!!c?.eo;
  const mns=firstValue(cca,["Mns","mns"])??(typeof c?.mns==="object"?firstValue(c.mns,["activo","activa","enabled","habilitado"]):c?.mns);
  const app=firstValue(cca,["App","app"])??installedApp(c);
  return {Se:asBool(se??c?.authenticated),Us:asBool(us??!!c?.user),Eo:asBool(eo),Mns:asBool(mns),App:asBool(app)};
}
function paintCca(c){
  const b=ccaBits(c);
  document.querySelector("#ccaLabel").textContent=`CCA · Se${+b.Se} Us${+b.Us} Eo${+b.Eo} Mns${+b.Mns} App${+b.App}`;
}
function eoInfoRows(eo={}){
  const fields=[
    ["Código",firstValue(eo,["codigoEO","codigo","clave"])],
    ["Nombre",firstValue(eo,["nombreMostrar","nombre","razonSocial"])],
    ["Razón social",firstValue(eo,["razonSocial","nombreLegal"])],
    ["Correo",firstValue(eo,["email","correo"])],
    ["Teléfono",firstValue(eo,["telefono","phone"])],
    ["Sitio",firstValue(eo,["sitioWeb","web","website","url"])]
  ].filter(([,v])=>v);
  return fields.length?fields.map(([k,v])=>`<div><span>${k}</span><strong>${String(v)}</strong></div>`).join(""):"<div><span>Información</span><strong>Sin datos adicionales disponibles.</strong></div>";
}
function paintEo(eo){
  const name=eo?.nombreMostrar||eo?.nombre||"Información pública";
  document.querySelector("#eoName").textContent=name;
  document.querySelector("#eoModalTitle").textContent=name;
  setAvatar(document.querySelector("#eoAvatar"),eo,name);
  setAvatar(document.querySelector("#eoModalAvatar"),eo,name);
  document.querySelector("#eoModalInfo").innerHTML=eoInfoRows(eo||{});
}
function initEoModal(){
  const modal=document.querySelector("#eoModal");
  document.querySelector("#eoIdentity").addEventListener("click",()=>modal.hidden=false);
  document.querySelector("#btnCloseEoModal").addEventListener("click",()=>modal.hidden=true);
  modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")modal.hidden=true});
}
function paintContext(c){
  const auth=c?.authenticated===true;
  const login=document.querySelector("#btnLogin"),account=document.querySelector("#btnAccount");
  login.hidden=auth;account.hidden=!auth;
  paintCca(c);
  paintEo(auth?c?.eo:null);
  if(!auth){
    document.querySelector("#eoChannelName").textContent="EO";
    document.querySelector("#btnAdminPanel").hidden=true;
    return;
  }
  const name=c?.user?.nombreVisible||c?.user?.nombre||"Usuario",email=c?.email||c?.user?.email||"",eo=c?.eo?.nombreMostrar||c?.eo?.nombre||"EO";
  document.querySelector("#eoChannelName").textContent=eo;
  for(const id of ["#topUserName","#menuUserName"])document.querySelector(id).textContent=name;
  document.querySelector("#menuUserEmail").textContent=email;
  for(const id of ["#topAvatar","#menuAvatar"])setAvatar(document.querySelector(id),c?.user,name);
  document.querySelector("#btnAdminPanel").hidden=!(c?.roles||[]).includes("ADM");
}
async function boot(){
  initAccountMenu();initTv();initEoModal();
  let c;
  try{c=await resolveAccessContext()}
  catch(error){
    console.error("NEXUS | SYS AUT | CONTEXT_ERROR",{code:error?.code||null,status:error?.status||null,message:error?.message||String(error),payload:error?.payload||null});
    c={authenticated:false,roles:[],modules:[]};
  }
  paintContext(c);renderModules(document.querySelector("#modulesGrid"),BASIC_MODULES,c);
  document.querySelector("#modulesGrid").addEventListener("click",e=>{
    const card=e.target.closest("[data-module]");
    if(!card||card.classList.contains("is-locked"))return;
    if(card.dataset.module==="training"){
      const target=getMemberAreaUrl({slug:"jorgeaad6759607"},"challenges");
      window.location.assign(target);
    }
  });
  document.querySelector("#btnLogin").addEventListener("click",startLogin);
  document.addEventListener("nexus:navigation",e=>{if(e.detail?.action==="logout")logoutLocal()});
  document.querySelector("#versionLabel").textContent=`NEXUS · v${VERSION}`;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
}
boot().catch(console.error);
