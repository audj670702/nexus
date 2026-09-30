import {createLocalId,putQueueItem,listQueueItems,putEvidence,listEvidence,deleteEvidence,putReference,getReference} from "./local-first.js";

let bitContext=null;
let bitState={tipos:[],eventos:[],seguimientoEventos:[],facultades:{registro:false,consulta:false,consultaAmpliada:false,seguimiento:false},evidencias:false};
let selectedEvidence=[];
let lockedLocalId="";
let selectedProgramacionId="";
let lastSavedSnapshot=null;
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-MX").trim();
const fmt=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("es-MX")};
const cacheKey=()=>`BIT:NEXUS:${String(bitContext?.memberId||"")}:${String(bitContext?.eo?.codigoEO||"")}`;

function nowLocal(){const d=new Date(),pad=n=>String(n).padStart(2,"0");return {fecha:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,hora:`${pad(d.getHours())}:${pad(d.getMinutes())}`}}
function setTab(name){
  const map={registro:["#btnBitRegistro","#bitRegistroView"],consulta:["#btnBitConsulta","#bitConsultaView"],seguimiento:["#btnBitSeguimiento","#bitSeguimientoView"]};
  Object.values(map).forEach(([b,v])=>{$(b)?.classList.remove("is-active");if($(v))$(v).hidden=true});
  $("#bitDetalleView").hidden=true;const target=map[name]||map.consulta;$(target[0])?.classList.add("is-active");$(target[1]).hidden=false;
}
function activityDate(a){const raw=a?.inicio||a?.fechaInicio||a?.fecha||a?.start||"";if(!raw)return "";const d=new Date(raw);if(Number.isNaN(d.getTime()))return "";const pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function activityTime(a){const raw=a?.inicio||a?.fechaInicio||a?.fecha||a?.start||"";if(!raw)return "—";const d=new Date(raw);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})}
function activityTitle(a){return String(a?.titulo||a?.nombre||a?.actividad||"Actividad")}
function activityType(a){return String(a?.tipoActividad||a?.tipoEtiqueta||a?.tipo||"")}
function programacionItems(){return (Array.isArray(bitContext?.actividades)?bitContext.actividades:[]).slice().sort((a,b)=>{const ad=new Date(a?.inicio||a?.fechaInicio||a?.fecha||a?.start||0).getTime()||0,bd=new Date(b?.inicio||b?.fechaInicio||b?.fecha||b?.start||0).getTime()||0;return ad-bd||activityTitle(a).localeCompare(activityTitle(b),"es")})}
function selectedActivity(){return programacionItems().find(a=>String(a?.id||a?._id||"")===selectedProgramacionId)||null}
function paintProgramacionSelection(){const el=$("#bitRelacionResumen");if(!el)return;const a=selectedActivity();el.textContent=a?`${activityTime(a)} · ${activityTitle(a)}`:"Seleccionar actividad"}
function fillProgramacionFilters(){const type=$("#bitRelacionTipo");if(!type)return;const current=type.value,types=[...new Set(programacionItems().map(activityType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));type.innerHTML='<option value="">Todos</option>'+types.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(types.includes(current))type.value=current}
function renderProgramacionPicker(){const list=$("#bitRelacionLista");if(!list)return;const all=$("#bitRelacionTodas")?.checked===true,date=String($("#bitRelacionFecha")?.value||""),type=String($("#bitRelacionTipo")?.value||""),q=norm($("#bitRelacionBuscar")?.value);const items=programacionItems().filter(a=>{if(!all&&date&&activityDate(a)!==date)return false;if(type&&activityType(a)!==type)return false;return !q||norm(`${activityTitle(a)} ${activityType(a)} ${a?.descripcion||""}`).includes(q)});$("#bitRelacionCount").textContent=`${items.length} actividad${items.length===1?"":"es"}`;list.innerHTML=items.length?items.map(a=>{const id=String(a?.id||a?._id||""),meta=[activityType(a),activityDate(a)].filter(Boolean).join(" · ");return `<button class="bit-relation-item" type="button" data-programacion-id="${esc(id)}"><span class="bit-relation-time">${esc(activityTime(a))}</span><span class="bit-relation-copy"><strong>${esc(activityTitle(a))}</strong><span>${esc(meta)}</span></span></button>`}).join(""):'<div class="bit-relation-empty">No hay actividades para los filtros seleccionados.</div>'}
function openProgramacionPicker(){const modal=$("#bitRelacionModal");if(!modal)return;fillProgramacionFilters();$("#bitRelacionBuscar").value="";$("#bitRelacionTodas").checked=false;$("#bitRelacionFecha").value=String($("#bitFecha")?.value||nowLocal().fecha);renderProgramacionPicker();modal.hidden=false}
function closeProgramacionPicker(){const modal=$("#bitRelacionModal");if(modal)modal.hidden=true}
function fillTypes(){
  const active=bitState.tipos.filter(t=>t?.activo!==false);
  const options=active.map(t=>`<option value="${esc(t.id||t._id||t.clave||"")}">${esc(t.etiqueta||t.nombre||t.clave||"Tipo")}</option>`).join("");
  $("#bitTipo").innerHTML='<option value="">Seleccionar tipo</option>'+options;
  $("#bitFiltroTipo").innerHTML='<option value="">Todos los tipos</option>'+options;
}
function renderEvents(){
  const q=norm($("#bitBuscar")?.value),tipo=String($("#bitFiltroTipo")?.value||""),showSub=$("#bitMostrarSustituidos")?.checked===true;
  const items=bitState.eventos.filter(e=>{if(!showSub&&String(e.estado||"VIGENTE").toUpperCase()==="SUSTITUIDO")return false;if(tipo&&String(e.tipoId||e.tipo?.id||"")!==tipo)return false;const hay=norm(`${e.folio||""} ${e.lugar||""} ${e.descripcion||""} ${e.comentarios||""} ${e.tipoEtiqueta||e.tipo?.etiqueta||""} ${e.registranteNombre||""}`);return !q||hay.includes(q)});
  $("#bitConsultaCount").textContent=`${items.length} evento${items.length===1?"":"s"}`;
  const rows=items.map((e,i)=>{const raw=e.fechaHoraEvento||e.fechaEvento||e.fecha||"",d=raw?new Date(raw):null,valid=d&&!Number.isNaN(d.getTime()),fecha=valid?d.toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}):"—",hora=valid?d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"—",folio=String(e.folio||""),m=folio.match(/(\\d+)$/),codigo=m?m[1]:folio||"—";return `<button class="bitacora-item" type="button" data-bit-id="${esc(e.id||e._id||"")}"><span class="bitacora-line">${i+1}</span><span class="bitacora-date">${esc(fecha)}</span><span class="bitacora-time">${esc(hora)}</span><span class="bitacora-item-copy"><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"Evento")}</strong><span>${esc(e.descripcion||"")}</span></span><span class="bitacora-folio">${esc(codigo)}</span><span class="bitacora-item-state">${esc(e.estado||"VIGENTE")}</span></button>`}).join("");
  $("#bitEventosList").innerHTML=items?`<div class="bitacora-list-head"><span>No.</span><span>Fecha</span><span>Hora</span><span>Tipo / Descripción</span><span>Código</span><span>Estatus</span></div>${rows}`:'<div class="bitacora-empty">No hay eventos disponibles dentro de tu alcance de consulta.</div>';
}
function renderFollowup(){
  const items=bitState.seguimientoEventos;
  $("#bitSeguimientoList").innerHTML=items.length?items.map(e=>`<button class="bitacora-item" type="button" data-bit-id="${esc(e.id||e._id||"")}"><span class="bitacora-folio">${esc(e.folio||"—")}</span><span class="bitacora-item-copy"><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"Evento")}</strong><span>${esc(e.descripcion||"")}</span></span><span class="bitacora-item-state">SEGUIMIENTO</span></button>`).join(""):'<div class="bitacora-empty">No hay eventos que requieran seguimiento dentro de tu alcance.</div>';
}
function openDetail(id){
  const e=[...bitState.eventos,...bitState.seguimientoEventos].find(x=>String(x.id||x._id||"")===String(id||""));if(!e)return;
  ["#bitRegistroView","#bitConsultaView","#bitSeguimientoView"].forEach(s=>$(s).hidden=true);
  $("#bitDetalle").innerHTML=`<div class="bitacora-detail-row"><span>Folio</span><strong>${esc(e.folio||"—")}</strong></div><div class="bitacora-detail-row"><span>Tipo</span><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"—")}</strong></div><div class="bitacora-detail-row"><span>Evento</span><strong>${esc(fmt(e.fechaHoraEvento))}</strong></div><div class="bitacora-detail-row"><span>Lugar</span><strong>${esc(e.lugar||"—")}</strong></div><div class="bitacora-detail-row"><span>Registrado</span><strong>${esc(fmt(e.fechaHoraRegistro))}</strong></div><div class="bitacora-detail-row"><span>Responsable</span><strong>${esc(e.registranteNombre||"—")}</strong></div><div class="bitacora-detail-row"><span>Descripción</span><strong>${esc(e.descripcion||"—")}</strong></div><div class="bitacora-detail-row"><span>Comentarios</span><strong>${esc(e.comentarios||"—")}</strong></div><div class="bitacora-detail-row"><span>Estado</span><strong>${esc(e.estado||"VIGENTE")}</strong></div>${Array.isArray(e.seguimientos)&&e.seguimientos.length?e.seguimientos.map(s=>`<div class="bitacora-detail-row"><span>${esc(fmt(s.fechaRegistro))} · ${esc(s.autorNombre||"Usuario")}</span><strong>${esc(s.nota||"")}</strong></div>`).join(""):""}${bitState.facultades.seguimiento===true&&e.requiereSeguimiento===true&&String(e.estado||"VIGENTE").toUpperCase()==="VIGENTE"?'<div class="bitacora-form"><label>Nueva anotación<textarea id="bitSeguimientoNota" rows="3" maxlength="2000" placeholder="Registra la anotación de seguimiento."></textarea></label></div><div class="bitacora-actions"><button id="btnBitGuardarSeguimiento" class="bitacora-primary" type="button">Guardar seguimiento</button></div>':""}`;
  $("#bitDetalleView").hidden=false;
  $("#btnBitGuardarSeguimiento")?.addEventListener("click",()=>{const nota=String($("#bitSeguimientoNota")?.value||"").trim();if(nota)document.dispatchEvent(new CustomEvent("nexus:bitacora-followup",{detail:{eventoId:String(e.id||e._id||""),nota}}))});
}
function applyCapabilities(){
  $("#btnBitRegistro").hidden=bitState.facultades.registro!==true;$("#btnBitConsulta").hidden=bitState.facultades.consulta!==true;$("#btnBitSeguimiento").hidden=bitState.facultades.seguimiento!==true;$("#bitEvidenciaField").hidden=bitState.evidencias!==true;
}
function renderSelectedEvidence(){
  const box=$("#bitEvidenceSelected");if(!box)return;
  box.innerHTML=selectedEvidence.map((x,i)=>`<div class="bit-evidence-chip"><span>${esc(x.name)}</span><button type="button" data-remove-evidence="${i}" aria-label="Eliminar ${esc(x.name)}">×</button></div>`).join("");
  box.hidden=!selectedEvidence.length;
}
function typeLabel(id){const t=bitState.tipos.find(x=>String(x.id||x._id||x.clave||"")===String(id||""));return String(t?.etiqueta||t?.nombre||t?.clave||"—")}
function evidencePreviewHtml(files=[],isTip=false){
  if(!files.length)return "";
  const images=files.filter(f=>String(f.type||"").startsWith("image/"));
  if(isTip&&images.length){
    const src=URL.createObjectURL(images[0]);
    return `<div class="bit-saved-evidence"><span>Evidencia</span><img src="${esc(src)}" alt="Evidencia principal de la TIP"></div>`;
  }
  return `<div class="bit-saved-line"><span>Evidencia</span><button id="btnBitVerEvidencia" class="bit-evidence-action" type="button">Ver evidencia${files.length>1?"s":""}</button></div>`;
}
function renderSavedRegister(folio=""){
  const box=$("#bitRegistroSaved");if(!box||!lastSavedSnapshot)return;
  const s=lastSavedSnapshot,a=s.programacionId?selectedActivity():null;
  box.innerHTML=`<div class="bit-saved-head"><div><span class="bit-tip-dot ${s.esTip?"bit-tip-dot-red bit-tip-pulse":"bit-tip-dot-black"}" aria-hidden="true"></span><strong>${s.esTip?"Tarjeta Informativa Prioritaria":"Registro de Bitácora"}</strong></div><span>${esc(folio||"Pendiente de sincronización")}</span></div>
    <div class="bit-saved-line"><span>Tipo de evento</span><strong>${esc(typeLabel(s.tipoId))}</strong></div>
    <div class="bit-saved-line"><span>Fecha / hora</span><strong>${esc(s.fecha)} · ${esc(s.hora)}</strong></div>
    ${a?`<div class="bit-saved-line"><span>Actividad relacionada</span><strong>${esc(activityTitle(a))}</strong></div>`:""}
    ${s.lugar?`<div class="bit-saved-line"><span>Lugar</span><strong>${esc(s.lugar)}</strong></div>`:""}
    <div class="bit-saved-block"><span>Descripción</span><p>${esc(s.descripcion)}</p></div>
    ${s.comentarios?`<div class="bit-saved-block"><span>Comentarios</span><p>${esc(s.comentarios)}</p></div>`:""}
    <div class="bit-saved-line"><span>Seguimiento</span><strong>${s.requiereSeguimiento?"Requerido":"No requerido"}</strong></div>
    ${evidencePreviewHtml(selectedEvidence,s.esTip)}`;
  box.hidden=false;
  $("#btnBitVerEvidencia")?.addEventListener("click",()=>{const f=selectedEvidence[0];if(!f)return;const url=URL.createObjectURL(f);window.open(url,"_blank","noopener,noreferrer")});
}
function setRegisterLocked(locked,folio=""){
  const form=$("#bitRegistroView");if(!form)return;
  $("#bitacoraForm")?.toggleAttribute("hidden",locked);
  const formBox=form.querySelector(".bitacora-form");if(formBox)formBox.hidden=locked;
  $("#btnBitGuardar").hidden=locked;$("#btnBitNuevo").hidden=!locked;
  const lock=$("#bitRegistroLock");lock.hidden=!locked;
  $("#bitFolio").textContent=folio?`Folio: ${folio}`:(locked?"Folio: pendiente de sincronización":"Folio: —");
  if(locked)renderSavedRegister(folio);else if($("#bitRegistroSaved"))$("#bitRegistroSaved").hidden=true;
}
function clearRegisterForm(){
  $("#bitTipo").value="";selectedProgramacionId="";paintProgramacionSelection();$("#bitLugar").value="";$("#bitDescripcion").value="";$("#bitComentarios").value="";$("#bitRequiereSeguimiento").checked=false;$("#bitEsTip").checked=false;$("#bitEvidencias").value="";selectedEvidence=[];lastSavedSnapshot=null;renderSelectedEvidence();const n=nowLocal();$("#bitFecha").value=n.fecha;$("#bitHora").value=n.hora;
}
async function refreshLocalStatus(){
  const items=await listQueueItems("BIT");const pending=items.filter(x=>x.syncStatus!=="SINCRONIZADO");const errors=pending.filter(x=>x.syncStatus==="ERROR");
  const el=$("#bitSyncStatus");if(!el)return;
  if(!navigator.onLine){el.textContent=`● Sin conexión · ${pending.length?pending.length+" pendiente"+(pending.length===1?"":"s"):"Puedes continuar registrando"}`;el.dataset.state="offline"}
  else if(errors.length){el.textContent=`⚠ ${errors.length} error${errors.length===1?"":"es"} de sincronización`;el.dataset.state="error"}
  else if(pending.length){el.textContent=`↻ ${pending.length} pendiente${pending.length===1?"":"s"}`;el.dataset.state="pending"}
  else{el.textContent="● En línea · Todo sincronizado";el.dataset.state="ok"}
  renderPending(items);
}
async function renderPending(items=null){
  const panel=$("#bitPendingPanel");if(!panel)return;const rows=items||await listQueueItems("BIT");const pending=rows.filter(x=>x.syncStatus!=="SINCRONIZADO");
  panel.innerHTML=pending.length?pending.map(x=>`<div class="bit-pending-row"><div><strong>${esc(x.serverFolio||x.localId)}</strong><span>${esc(fmt(x.createdLocalAt))}</span></div><span>${esc(x.syncStatus)}</span>${x.syncError?`<small>${esc(x.syncError)}</small>`:""}${x.syncStatus==="ERROR"?`<button type="button" data-retry-local-id="${esc(x.localId)}">Reintentar</button>`:""}</div>`).join(""):'<div class="bitacora-empty">No hay registros pendientes.</div>';
}
async function saveLocalEvent(){
  const detail={tipoId:String($("#bitTipo").value||""),programacionId:selectedProgramacionId,fecha:String($("#bitFecha").value||""),hora:String($("#bitHora").value||""),lugar:String($("#bitLugar").value||"").trim(),descripcion:String($("#bitDescripcion").value||"").trim(),comentarios:String($("#bitComentarios").value||"").trim(),requiereSeguimiento:$("#bitRequiereSeguimiento").checked===true,esTip:$("#bitEsTip").checked===true};
  if(!detail.tipoId||!detail.fecha||!detail.hora||!detail.descripcion){window.alert("Completa Tipo de evento, fecha, hora y descripción.");return}
  const localId=createLocalId("bit"),createdLocalAt=new Date().toISOString();
  const queueItem={localId,module:"BIT",operation:"REGISTER_EVENT",payload:detail,syncStatus:"PENDIENTE",createdLocalAt,lastSyncAttempt:null,syncError:"",syncAttempts:0,serverId:"",serverFolio:""};
  await putQueueItem(queueItem);
  for(const file of selectedEvidence){
    if(file.size>10*1024*1024){window.alert(`La evidencia "${file.name}" excede 10 MB y no fue guardada.`);continue}
    await putEvidence({evidenceId:createLocalId("evi"),localId,file,name:file.name,type:file.type||"application/octet-stream",size:file.size,syncStatus:"PENDIENTE",syncAttempts:0,lastSyncAttempt:null,syncError:""});
  }
  lastSavedSnapshot={...detail};lockedLocalId=localId;setRegisterLocked(true);await refreshLocalStatus();
  document.dispatchEvent(new CustomEvent("nexus:bitacora-local-saved",{detail:{localId}}));
}
export function setBitacoraContext(context){bitContext=context||null}
export async function getCachedBitacoraAccess(){if(!bitContext?.memberId||!bitContext?.eo?.codigoEO)return null;return getReference(cacheKey())}
export async function setBitacoraState(next={}){
  const hasServerState=Array.isArray(next.tipos);
  if(hasServerState&&bitContext?.memberId&&bitContext?.eo?.codigoEO)await putReference(cacheKey(),{tipos:next.tipos||[],facultades:next.facultades||{},evidencias:next.evidencias===true});
  let source=next;
  if(!hasServerState&&bitContext?.memberId&&bitContext?.eo?.codigoEO){
    const cached=await getReference(cacheKey());if(cached)source={...next,...cached};
  }
  bitState={tipos:Array.isArray(source.tipos)?source.tipos:[],eventos:Array.isArray(source.eventos)?source.eventos:[],seguimientoEventos:Array.isArray(source.seguimientoEventos)?source.seguimientoEventos:[],facultades:{registro:false,consulta:false,consultaAmpliada:false,seguimiento:false,...(source.facultades||{})},evidencias:source.evidencias===true};
  fillTypes();applyCapabilities();renderEvents();renderFollowup();await refreshLocalStatus();
}
export function openBitacora(){
  if(bitContext?.authenticated!==true)return;
  lockedLocalId="";clearRegisterForm();fillProgramacionFilters();setRegisterLocked(false);$("#bitRegistroResult").hidden=true;
  const n=nowLocal();if(!$("#bitFecha").value)$("#bitFecha").value=n.fecha;if(!$("#bitHora").value)$("#bitHora").value=n.hora;
  $("#bitacoraModal").hidden=false;const first=bitState.facultades.registro===true?"registro":bitState.facultades.consulta===true?"consulta":"seguimiento";setTab(first);refreshLocalStatus();
}
export async function getPendingBitEvents(){return (await listQueueItems("BIT")).filter(x=>x.syncStatus!=="SINCRONIZADO")}
export async function getBitEvidence(localId){return listEvidence(localId)}
export async function updateBitQueue(item){await putQueueItem(item);if(lockedLocalId&&item?.localId===lockedLocalId&&item?.serverFolio)setRegisterLocked(true,String(item.serverFolio));await refreshLocalStatus()}
export async function updateBitEvidence(item){await putEvidence(item);await refreshLocalStatus()}
export async function removeBitEvidence(evidenceId){await deleteEvidence(evidenceId);await refreshLocalStatus()}
export async function notifyBitSynced(){await refreshLocalStatus()}
export function initBitacora(){
  const modal=$("#bitacoraModal");if(!modal)return;
  $("#btnCloseBitacora").addEventListener("click",()=>modal.hidden=true);modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)modal.hidden=true});
  $("#btnBitRegistro").addEventListener("click",()=>setTab("registro"));$("#btnBitConsulta").addEventListener("click",()=>{setTab("consulta");renderEvents()});$("#btnBitSeguimiento").addEventListener("click",()=>{setTab("seguimiento");renderFollowup()});$("#btnBitBack").addEventListener("click",()=>setTab("consulta"));
  $("#bitBuscar").addEventListener("input",renderEvents);$("#bitFiltroTipo").addEventListener("change",renderEvents);$("#bitMostrarSustituidos").addEventListener("change",renderEvents);$("#bitEventosList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});$("#bitSeguimientoList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});
  $("#btnBitRelacionar")?.addEventListener("click",openProgramacionPicker);$("#btnBitRelacionCerrar")?.addEventListener("click",closeProgramacionPicker);$("#bitRelacionModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeProgramacionPicker()});$("#bitRelacionBuscar")?.addEventListener("input",renderProgramacionPicker);$("#bitRelacionFecha")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionTipo")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionTodas")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionLista")?.addEventListener("click",e=>{const row=e.target.closest("[data-programacion-id]");if(!row)return;selectedProgramacionId=String(row.dataset.programacionId||"");paintProgramacionSelection();closeProgramacionPicker()});$("#bitFecha")?.addEventListener("change",()=>{if(!selectedProgramacionId)return;const a=selectedActivity();if(a&&activityDate(a)!==String($("#bitFecha").value||"")){selectedProgramacionId="";paintProgramacionSelection()}});
  $("#bitEvidencias").addEventListener("change",e=>{selectedEvidence=[...selectedEvidence,...Array.from(e.target.files||[])].slice(0,10);e.target.value="";renderSelectedEvidence()});
  $("#bitEvidenceSelected").addEventListener("click",e=>{const b=e.target.closest("[data-remove-evidence]");if(!b)return;selectedEvidence.splice(Number(b.dataset.removeEvidence),1);renderSelectedEvidence()});
  $("#btnBitGuardar").addEventListener("click",()=>saveLocalEvent().catch(error=>window.alert(error?.message||"No fue posible guardar el registro en este dispositivo.")));
  $("#btnBitNuevo").addEventListener("click",()=>{lockedLocalId="";clearRegisterForm();setRegisterLocked(false);$("#bitRegistroResult").hidden=true;const n=nowLocal();$("#bitFecha").value=n.fecha;$("#bitHora").value=n.hora;});
  $("#bitSyncStatus").addEventListener("click",()=>{const p=$("#bitPendingPanel");p.hidden=!p.hidden;if(!p.hidden)renderPending()});
  $("#bitPendingPanel").addEventListener("click",e=>{const b=e.target.closest("[data-retry-local-id]");if(b)document.dispatchEvent(new CustomEvent("nexus:bitacora-retry",{detail:{localId:b.dataset.retryLocalId}}))});
  window.addEventListener("online",()=>{refreshLocalStatus();document.dispatchEvent(new CustomEvent("nexus:bitacora-sync-request"))});window.addEventListener("offline",refreshLocalStatus);
  setBitacoraState({});
}
