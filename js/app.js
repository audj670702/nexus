import {resolveAccessContext,startLogin,logoutLocal} from "./auth.js";
import {initAccountMenu} from "./navigation.js";
import {BASIC_MODULES,renderModules} from "./modules.js";
import {initTv,setTvContext} from "./tv.js";
import "./mns.js";
import {initDocuments,setDocumentsContext,openDocuments} from "./documents.js";
import {initSchedule,setScheduleContext,openSchedule} from "./schedule.js";
import {initBitacora,setBitacoraContext,setBitacoraState,openBitacora,getPendingBitEvents,getBitEvidence,updateBitQueue,updateBitEvidence,notifyBitSynced,getCachedBitacoraAccess} from "./bitacora.js";

const VERSION="0.2.64";

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

async function loadBitacoraState(context){
  if(context?.authenticated!==true||!context?.memberId||!context?.eo?.codigoEO){
    context.bitacora={activo:false,facultades:{}};
    setBitacoraState({});
    return;
  }
  try{
    const url=new URL(`${API_BASE}/nexusBitacoraState`);
    url.searchParams.set("memberId",context.memberId);
    url.searchParams.set("codigoEO",context.eo.codigoEO);
    const response=await fetch(url.toString(),{method:"GET",mode:"cors",cache:"no-store",credentials:"omit",headers:{"Accept":"application/json"}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok!==true)throw new Error(data?.mensaje||"No fue posible cargar Bitácora.");
    context.bitacora={activo:data.activo===true,facultades:data.facultades||{}};
    setBitacoraState(data);
  }catch(error){
    console.error("NEXUS | BITACORA | STATE_ERROR",error);
    const cached=await getCachedBitacoraAccess().catch(()=>null);
    if(cached){context.bitacora={activo:cached?.facultades?.registro===true||cached?.facultades?.consulta===true||cached?.facultades?.seguimiento===true,facultades:cached.facultades||{}};await setBitacoraState(cached)}else{context.bitacora={activo:false,facultades:{}};await setBitacoraState({})}
  }
}
async function syncBitacoraEvidence(queueItem,evidence){
  const memberId=String(currentContext?.memberId||"").trim(),codigoEO=String(currentContext?.eo?.codigoEO||"").trim();
  evidence={...evidence,syncStatus:"SUBIENDO",lastSyncAttempt:new Date().toISOString(),syncAttempts:Number(evidence.syncAttempts||0)+1,syncError:""};
  await updateBitEvidence(evidence);
  try{
    const prep=await fetch(`${API_BASE}/nexusBitacoraEvidencePrepare`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,codigoEO,localId:queueItem.localId,evidenceId:evidence.evidenceId,fileName:evidence.name,mimeType:evidence.type,size:evidence.size})});
    const prepared=await prep.json().catch(()=>({}));
    if(!prep.ok||prepared?.ok!==true||!prepared.uploadUrl)throw new Error(prepared?.mensaje||"No fue posible preparar la evidencia.");
    const upload=await fetch(prepared.uploadUrl,{method:"PUT",headers:{"Content-Type":evidence.type||"application/octet-stream"},body:evidence.file});
    const uploaded=await upload.json().catch(()=>null);
    if(!upload.ok)throw new Error("No fue posible subir la evidencia.");
    const fin=await fetch(`${API_BASE}/nexusBitacoraEvidenceFinalize`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,codigoEO,eventoId:queueItem.serverId,localId:queueItem.localId,evidenceId:evidence.evidenceId,fileName:evidence.name,mimeType:evidence.type,size:evidence.size,upload:uploaded})});
    const finalized=await fin.json().catch(()=>({}));
    if(!fin.ok||finalized?.ok!==true)throw new Error(finalized?.mensaje||"No fue posible vincular la evidencia.");
    evidence={...evidence,syncStatus:"SINCRONIZADA",syncError:"",serverEvidence:finalized.evidencia||null};
  }catch(error){evidence={...evidence,syncStatus:"ERROR",syncError:error?.message||"Error de sincronización de evidencia."}}
  await updateBitEvidence(evidence);
}
async function syncBitacoraItem(item){
  const memberId=String(currentContext?.memberId||"").trim(),codigoEO=String(currentContext?.eo?.codigoEO||"").trim();
  if(!memberId||!codigoEO||!navigator.onLine)return;
  item={...item,syncStatus:"SINCRONIZANDO",lastSyncAttempt:new Date().toISOString(),syncAttempts:Number(item.syncAttempts||0)+1,syncError:""};
  await updateBitQueue(item);
  try{
    const response=await fetch(`${API_BASE}/nexusBitacoraEvent`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,codigoEO,evento:{...item.payload,localId:item.localId}})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok!==true)throw new Error(data?.mensaje||"No fue posible sincronizar el evento.");
    item={...item,syncStatus:"SINCRONIZADO",serverId:String(data?.evento?.id||""),serverFolio:String(data?.evento?.folio||""),syncError:""};
    await updateBitQueue(item);
    for(const evidence of await getBitEvidence(item.localId)){if(evidence.syncStatus!=="SINCRONIZADA")await syncBitacoraEvidence(item,evidence)}
    await loadBitacoraState(currentContext);
  }catch(error){item={...item,syncStatus:"ERROR",syncError:error?.message||"Error de sincronización."};await updateBitQueue(item)}
}
let bitSyncRunning=false;
async function syncBitacoraQueue(localId=""){
  if(bitSyncRunning||!navigator.onLine)return;
  bitSyncRunning=true;
  try{
    const items=await getPendingBitEvents();
    for(const item of items){if(!localId||item.localId===localId)await syncBitacoraItem(item)}
  }finally{bitSyncRunning=false;await notifyBitSynced()}
}
async function saveBitacoraFollowup(detail={}){
  const memberId=String(currentContext?.memberId||"").trim(),codigoEO=String(currentContext?.eo?.codigoEO||"").trim();
  if(!memberId||!codigoEO||!detail.eventoId||!detail.nota)return;
  const response=await fetch(`${API_BASE}/nexusBitacoraFollowup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({memberId,codigoEO,eventoId:detail.eventoId,nota:detail.nota})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true)throw new Error(data?.mensaje||"No fue posible guardar el seguimiento.");
  await loadBitacoraState(currentContext);
  window.alert(data.mensaje||"Seguimiento registrado.");
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
let deferredInstallPrompt=window.__nexusInstallPrompt||null;
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
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();window.__nexusInstallPrompt=event;deferredInstallPrompt=event;renderInstallOption()});
  window.addEventListener("appinstalled",()=>{window.__nexusInstallPrompt=null;deferredInstallPrompt=null;renderInstallOption()});
  document.querySelector("#installButton")?.addEventListener("click",async()=>{
    if(installedApp())return;
    if(isIosDevice()){openIosTutorial();return}
    deferredInstallPrompt=deferredInstallPrompt||window.__nexusInstallPrompt||null;
    if(!deferredInstallPrompt){window.alert("La instalación todavía no está disponible. Abre el menú del navegador y selecciona Instalar app o Instalar NEXUS.");return}
    const button=document.querySelector("#installButton");
    button.disabled=true;button.textContent="Instalando...";
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    window.__nexusInstallPrompt=null;
    deferredInstallPrompt=null;
    button.disabled=false;renderInstallOption();
  });
  renderInstallOption();
}

function eoInfoRows(eo={}){
  const description=firstValue(eo,["descripcion","descripcionEO","descripcionPublica","description"]);
  return description?`<p class="eo-description">${String(description)}</p>`:'<p class="eo-description eo-description-empty">Sin descripción disponible.</p>';
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
  setBitacoraContext(c);
  await loadBitacoraState(c);
  syncBitacoraQueue();
  paintContext(c);renderInstallOption();renderModules(document.querySelector("#modulesGrid"),BASIC_MODULES,c);setDocumentsContext(c);setScheduleContext(c);
  document.querySelector("#modulesGrid").addEventListener("click",e=>{
    const card=e.target.closest("[data-module]");
    if(!card||card.classList.contains("is-locked"))return;
    if(card.dataset.module==="docs"){openDocuments();return}
    if(card.dataset.module==="schedule"){openSchedule();return}
    if(card.dataset.module==="bitacora"){openBitacora();return}
    if(card.dataset.module==="training"){
      window.location.assign(withWixReturnUrl("https://www.scad.mx/members-area"));return
    }
    if(card.dataset.module==="admin"){
      window.location.assign("https://nexus.scad.mx/nexus-panel");return
    }
  });
  document.addEventListener("nexus:bitacora-local-saved",()=>syncBitacoraQueue());
  document.addEventListener("nexus:bitacora-sync-request",()=>syncBitacoraQueue());
  document.addEventListener("nexus:bitacora-retry",e=>syncBitacoraQueue(String(e.detail?.localId||"")));
  document.addEventListener("nexus:bitacora-followup",async e=>{try{await saveBitacoraFollowup(e.detail||{})}catch(error){console.error("NEXUS | BITACORA | FOLLOWUP_ERROR",error);window.alert(error?.message||"No fue posible guardar el seguimiento.")}});
  document.querySelector("#btnLogin").addEventListener("click",startLogin);
  document.addEventListener("nexus:navigation",e=>{if(e.detail?.action==="logout")logoutLocal();if(e.detail?.action==="admin")window.location.assign("https://nexus.scad.mx/nexus-panel")});
  document.addEventListener("nexus:mns-active",()=>{if(currentContext){currentContext.mns={...(currentContext.mns||{}),activo:true};paintCca(currentContext)}});
  document.querySelector("#versionLabel").textContent=`NEXUS · v${VERSION}`;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.error));
}
boot().catch(console.error);
