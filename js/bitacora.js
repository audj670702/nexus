import {createLocalId,putQueueItem,listQueueItems,putEvidence,listEvidence,deleteEvidence,putReference,getReference} from "./local-first.js";

let bitContext=null;
let bitState={tipos:[],eventos:[],seguimientoEventos:[],facultades:{registro:false,consulta:false,consultaAmpliada:false,seguimiento:false},evidencias:false};
let selectedEvidence=[];
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
  $("#bitEventosList").innerHTML=items.length?items.map(e=>`<button class="bitacora-item" type="button" data-bit-id="${esc(e.id||e._id||"")}"><span class="bitacora-folio">${esc(e.folio||"—")}</span><span class="bitacora-item-copy"><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"Evento")}</strong><span>${esc(e.descripcion||"")}</span></span><span class="bitacora-item-state">${esc(e.estado||"VIGENTE")}</span></button>`).join(""):'<div class="bitacora-empty">No hay eventos disponibles dentro de tu alcance de consulta.</div>';
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
function clearRegisterForm(){
  $("#bitTipo").value="";$("#bitLugar").value="";$("#bitDescripcion").value="";$("#bitComentarios").value="";$("#bitRequiereSeguimiento").checked=false;$("#bitEvidencias").value="";selectedEvidence=[];renderSelectedEvidence();const n=nowLocal();$("#bitFecha").value=n.fecha;$("#bitHora").value=n.hora;
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
  const detail={tipoId:String($("#bitTipo").value||""),fecha:String($("#bitFecha").value||""),hora:String($("#bitHora").value||""),lugar:String($("#bitLugar").value||"").trim(),descripcion:String($("#bitDescripcion").value||"").trim(),comentarios:String($("#bitComentarios").value||"").trim(),requiereSeguimiento:$("#bitRequiereSeguimiento").checked===true};
  if(!detail.tipoId||!detail.fecha||!detail.hora||!detail.descripcion){window.alert("Completa Tipo de evento, fecha, hora y descripción.");return}
  const localId=createLocalId("bit"),createdLocalAt=new Date().toISOString();
  const queueItem={localId,module:"BIT",operation:"REGISTER_EVENT",payload:detail,syncStatus:"PENDIENTE",createdLocalAt,lastSyncAttempt:null,syncError:"",syncAttempts:0,serverId:"",serverFolio:""};
  await putQueueItem(queueItem);
  for(const file of selectedEvidence){
    if(file.size>10*1024*1024){window.alert(`La evidencia "${file.name}" excede 10 MB y no fue guardada.`);continue}
    await putEvidence({evidenceId:createLocalId("evi"),localId,file,name:file.name,type:file.type||"application/octet-stream",size:file.size,syncStatus:"PENDIENTE",syncAttempts:0,lastSyncAttempt:null,syncError:""});
  }
  clearRegisterForm();await refreshLocalStatus();
  const notice=$("#bitRegistroResult");notice.hidden=false;notice.textContent=navigator.onLine?"Registro guardado en este dispositivo.":"Registro guardado en este dispositivo. Se sincronizará al recuperar conexión.";
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
  const n=nowLocal();if(!$("#bitFecha").value)$("#bitFecha").value=n.fecha;if(!$("#bitHora").value)$("#bitHora").value=n.hora;
  $("#bitacoraModal").hidden=false;const first=bitState.facultades.registro===true?"registro":bitState.facultades.consulta===true?"consulta":"seguimiento";setTab(first);refreshLocalStatus();
}
export async function getPendingBitEvents(){return (await listQueueItems("BIT")).filter(x=>x.syncStatus!=="SINCRONIZADO")}
export async function getBitEvidence(localId){return listEvidence(localId)}
export async function updateBitQueue(item){await putQueueItem(item);await refreshLocalStatus()}
export async function updateBitEvidence(item){await putEvidence(item);await refreshLocalStatus()}
export async function removeBitEvidence(evidenceId){await deleteEvidence(evidenceId);await refreshLocalStatus()}
export async function notifyBitSynced(){await refreshLocalStatus()}
export function initBitacora(){
  const modal=$("#bitacoraModal");if(!modal)return;
  $("#btnCloseBitacora").addEventListener("click",()=>modal.hidden=true);modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)modal.hidden=true});
  $("#btnBitRegistro").addEventListener("click",()=>setTab("registro"));$("#btnBitConsulta").addEventListener("click",()=>{setTab("consulta");renderEvents()});$("#btnBitSeguimiento").addEventListener("click",()=>{setTab("seguimiento");renderFollowup()});$("#btnBitBack").addEventListener("click",()=>setTab("consulta"));
  $("#bitBuscar").addEventListener("input",renderEvents);$("#bitFiltroTipo").addEventListener("change",renderEvents);$("#bitMostrarSustituidos").addEventListener("change",renderEvents);$("#bitEventosList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});$("#bitSeguimientoList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});
  $("#bitEvidencias").addEventListener("change",e=>{selectedEvidence=[...selectedEvidence,...Array.from(e.target.files||[])].slice(0,10);e.target.value="";renderSelectedEvidence()});
  $("#bitEvidenceSelected").addEventListener("click",e=>{const b=e.target.closest("[data-remove-evidence]");if(!b)return;selectedEvidence.splice(Number(b.dataset.removeEvidence),1);renderSelectedEvidence()});
  $("#btnBitGuardar").addEventListener("click",()=>saveLocalEvent().catch(error=>window.alert(error?.message||"No fue posible guardar el registro en este dispositivo.")));
  $("#bitSyncStatus").addEventListener("click",()=>{const p=$("#bitPendingPanel");p.hidden=!p.hidden;if(!p.hidden)renderPending()});
  $("#bitPendingPanel").addEventListener("click",e=>{const b=e.target.closest("[data-retry-local-id]");if(b)document.dispatchEvent(new CustomEvent("nexus:bitacora-retry",{detail:{localId:b.dataset.retryLocalId}}))});
  window.addEventListener("online",()=>{refreshLocalStatus();document.dispatchEvent(new CustomEvent("nexus:bitacora-sync-request"))});window.addEventListener("offline",refreshLocalStatus);
  setBitacoraState({});
}
