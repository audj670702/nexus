import {resolveAccessContext,startLogin,logoutLocal} from "./auth.js";
import {initAccountMenu} from "./navigation.js";
import {BASIC_MODULES,renderModules} from "./modules.js";
import {initTv,setTvContext} from "./tv.js";
import "./mns.js";
import {initDocuments,setDocumentsContext,openDocuments} from "./documents.js";
import {initSchedule,setScheduleContext,openSchedule} from "./schedule.js";
import {initBitacora,setBitacoraContext,openBitacora} from "./bitacora.js";

const VERSION="0.2.45";

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
const API_BASE="https://www.scad.mx/_functions";
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("No fue posible leer la fotografía."));
    reader.readAsDataURL(file);
  });
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

function installedApp(){
  return window.matchMedia?.("(display-mode: standalone)")?.matches===true||window.navigator.standalone===true;
}
function ccaBits(c){
  const cca=c?.cca||{};
  const auth=c?.auth||{};
  const se=firstValue(cca,["Se","se","sesion","sesionWix"])??firstValue(auth,["sesionWix","session","sesion","authenticated"]);
  const us=firstValue(cca,["Us","us","usuario","usuarioActivo"])??firstValue(c?.user,["activo","active","estatus"]);
  const eo=firstValue(cca,["Eo","eo"])??!!c?.eo;
  const mns=firstValue(cca,["Mns","mns"])??(typeof c?.mns==="object"?firstValue(c.mns,["activo","activa","enabled","habilitado"]):c?.mns);
  const app=installedApp();
  return {Se:asBool(se??c?.authenticated),Us:asBool(us??!!c?.user),Eo:asBool(eo),Mns:asBool(mns),App:asBool(app)};
}
function paintCca(c){
  const b=ccaBits(c);
  document.querySelector("#ccaLabel").textContent=`CCA · Se${+b.Se} Us${+b.Us} Eo${+b.Eo} Mns${+b.Mns} App${+b.App}`;
}
let deferredInstallPrompt=null;
function isIosDevice(){return /iphone|ipad|ipod/i.test(window.navigator.userAgent)}
function renderInstallOption(){
  const button=document.querySelector("#installButton");
  if(!button)return;
  const installed=installedApp();
  button.textContent=installed?"":"Instalar app";
  button.dataset.installed=installed?"true":"false";
  button.disabled=installed;
  button.hidden=installed;
  button.setAttribute("aria-label",installed?"App instalada":"Instalar app");
  if(currentContext)paintCca(currentContext);
}
function openIosTutorial(){
  const modal=document.querySelector("#iosTutorialModal"),video=document.querySelector("#iosTutorialVideo");
  if(!modal||!video)return;
  modal.hidden=false;document.body.style.overflow="hidden";document.querySelector("#iosTutorialClose")?.focus();video.load();
}
function closeIosTutorial(){
  const modal=document.querySelector("#iosTutorialModal"),video=document.querySelector("#iosTutorialVideo");
  if(!modal||!video)return;
  if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  else if(video.webkitDisplayingFullscreen&&video.webkitExitFullscreen)video.webkitExitFullscreen();
  video.pause();video.currentTime=0;modal.hidden=true;document.body.style.overflow="";document.querySelector("#installButton")?.focus();
}
function initInstallFlow(){
  document.querySelector("#iosTutorialClose")?.addEventListener("click",closeIosTutorial);
  document.querySelector("#iosTutorialModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeIosTutorial()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.querySelector("#iosTutorialModal")?.hidden)closeIosTutorial()});
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;renderInstallOption()});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;renderInstallOption()});
  document.querySelector("#installButton")?.addEventListener("click",async()=>{
    if(installedApp())return;
    if(isIosDevice()){openIosTutorial();return}
    if(!deferredInstallPrompt){window.alert("La instalación todavía no está disponible. Abre el menú del navegador y selecciona Instalar app o Instalar NEXUS.");return}
    const button=document.querySelector("#installButton");
    button.disabled=true;button.textContent="Instalando...";
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    button.disabled=false;renderInstallOption();
  });
  renderInstallOption();
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
let currentContext=null;
function initProfileModal(){
  const modal=document.querySelector("#profileModal");
  const close=()=>{modal.hidden=true;document.querySelector("#profileMessage").hidden=true};
  const open=()=>{
    const c=currentContext;
    if(!c?.authenticated)return;
    const user=c.user||{};
    const name=user.nombreVisible||user.nombre||"";
    document.querySelector("#profileName").value=name;
    document.querySelector("#profilePhone").value=firstValue(user,["telefono","phone","whatsapp"])||"";
    const fileInput=document.querySelector("#profileAvatarFile");
    fileInput.value="";
    fileInput.removeAttribute("capture");
    delete fileInput.dataset.previewUrl;
    document.querySelector("#profileEmail").textContent=c.email||user.email||"—";
    setAvatar(document.querySelector("#profileAvatar"),user,name||"Usuario");
    document.querySelector("#profileMessage").hidden=true;
    modal.hidden=false;
    requestAnimationFrame(()=>document.querySelector("#profileName").focus());
  };
  const fileInput=document.querySelector("#profileAvatarFile");
  const previewSelectedPhoto=()=>{
    const file=fileInput.files?.[0];
    if(!file)return;
    const old=fileInput.dataset.previewUrl;
    if(old)URL.revokeObjectURL(old);
    const url=URL.createObjectURL(file);
    fileInput.dataset.previewUrl=url;
    const avatar=document.querySelector("#profileAvatar");
    avatar.textContent="";
    avatar.style.backgroundImage=`url("${url}")`;
    avatar.style.backgroundSize="cover";
    avatar.style.backgroundPosition="center";
  };
  document.querySelector("#btnChooseProfilePhoto").addEventListener("click",()=>{
    fileInput.removeAttribute("capture");
    fileInput.click();
  });
  document.querySelector("#btnTakeProfilePhoto").addEventListener("click",()=>{
    fileInput.setAttribute("capture","user");
    fileInput.click();
  });
  fileInput.addEventListener("change",previewSelectedPhoto);
  document.querySelector("#btnCloseProfileModal").addEventListener("click",close);
  document.querySelector("#btnCancelProfile").addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close()});
  document.addEventListener("nexus:navigation",e=>{if(e.detail?.action==="profile")open()});
  document.querySelector("#btnSaveProfile").addEventListener("click",async()=>{
    const msg=document.querySelector("#profileMessage");
    const saveButton=document.querySelector("#btnSaveProfile");
    const file=fileInput.files?.[0]||null;
    const memberId=String(currentContext?.memberId||"").trim();
    const nombreApp=String(document.querySelector("#profileName").value||"").trim();
    const telefono=String(document.querySelector("#profilePhone").value||"").trim();
    if(!memberId)return;
    if(file&&file.size>5*1024*1024){
      msg.textContent="La fotografía debe pesar máximo 5 MB.";
      msg.hidden=false;
      return;
    }
    const payload={memberId,nombreApp,telefono,app:"NEXUS"};
    try{
      saveButton.disabled=true;
      saveButton.textContent="Guardando...";
      msg.hidden=true;
      if(file){
        payload.foto={base64:await fileToDataUrl(file),mimeType:file.type,fileName:file.name};
      }
      const response=await fetch(`${API_BASE}/sysPwaProfile`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data?.ok!==true)throw new Error(data?.error||"No fue posible guardar el perfil.");
      currentContext.user.nombreVisible=String(data.nombreApp||nombreApp||currentContext.user.nombreVisible||currentContext.user.nombre||"").trim();
      currentContext.user.telefono=String(data.telefono??telefono);
      if(data.avatar)currentContext.user.avatar=data.avatar;
      try{sessionStorage.setItem("nexus.sys.context",JSON.stringify(currentContext))}catch(_){}
      paintContext(currentContext);
      close();
    }catch(error){
      msg.textContent=error?.message||"No fue posible guardar el perfil.";
      msg.hidden=false;
    }finally{
      saveButton.disabled=false;
      saveButton.textContent="Guardar";
    }
  });
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
  initAccountMenu();initTv();initEoModal();initProfileModal();initInstallFlow();initDocuments();initSchedule();initBitacora();
  let c;
  try{c=await resolveAccessContext()}
  catch(error){
    console.error("NEXUS | SYS AUT | CONTEXT_ERROR",{code:error?.code||null,status:error?.status||null,message:error?.message||String(error),payload:error?.payload||null});
    c={authenticated:false,roles:[],modules:[]};
  }
  currentContext=c;
  setTvContext(c);
  paintContext(c);renderInstallOption();renderModules(document.querySelector("#modulesGrid"),BASIC_MODULES,c);setDocumentsContext(c);setScheduleContext(c);setBitacoraContext(c);
  document.querySelector("#modulesGrid").addEventListener("click",e=>{
    const card=e.target.closest("[data-module]");
    if(!card||card.classList.contains("is-locked"))return;
    if(card.dataset.module==="docs"){openDocuments();return}
    if(card.dataset.module==="schedule"){openSchedule();return}
    if(card.dataset.module==="bitacora"){openBitacora();return}
    if(card.dataset.module==="training"){
      const target=getMemberAreaUrl(currentContext?.user||{},"challenges");
      if(target==="#"){console.error("NEXUS | CAPACITACION | MEMBER_SLUG_MISSING");return}
      window.location.assign(target);
    }
  });
  document.querySelector("#btnLogin").addEventListener("click",startLogin);
  document.addEventListener("nexus:navigation",e=>{if(e.detail?.action==="logout")logoutLocal()});
  document.addEventListener("nexus:mns-active",()=>{if(currentContext){currentContext.mns={...(currentContext.mns||{}),activo:true};paintCca(currentContext)}});
  document.querySelector("#versionLabel").textContent=`NEXUS · v${VERSION}`;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
}
boot().catch(console.error);
