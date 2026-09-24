let bitContext=null;
let bitState={
  tipos:[],
  eventos:[],
  facultades:{registro:false,consulta:false,seguimiento:false},
  evidencias:false
};

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function nowLocal(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return {fecha:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,hora:`${pad(d.getHours())}:${pad(d.getMinutes())}`};
}
function setTab(name){
  const map={registro:["#btnBitRegistro","#bitRegistroView"],consulta:["#btnBitConsulta","#bitConsultaView"],seguimiento:["#btnBitSeguimiento","#bitSeguimientoView"]};
  Object.values(map).forEach(([b,v])=>{$(b)?.classList.remove("is-active");if($(v))$(v).hidden=true});
  $("#bitDetalleView").hidden=true;
  const target=map[name]||map.consulta;
  $(target[0])?.classList.add("is-active");
  $(target[1]).hidden=false;
}
function fillTypes(){
  const active=bitState.tipos.filter(t=>t?.activo!==false);
  const options=active.map(t=>`<option value="${esc(t.id||t._id||t.clave||"")}">${esc(t.etiqueta||t.nombre||t.clave||"Tipo")}</option>`).join("");
  $("#bitTipo").innerHTML='<option value="">Seleccionar tipo</option>'+options;
  $("#bitFiltroTipo").innerHTML='<option value="">Todos los tipos</option>'+options;
}
function renderEvents(){
  const q=String($("#bitBuscar")?.value||"").trim().toLowerCase();
  const tipo=String($("#bitFiltroTipo")?.value||"");
  const showSub=$("#bitMostrarSustituidos")?.checked===true;
  const items=bitState.eventos.filter(e=>{
    if(!showSub&&String(e.estado||"VIGENTE").toUpperCase()==="SUSTITUIDO")return false;
    if(tipo&&String(e.tipoId||e.tipo?.id||"")!==tipo)return false;
    const hay=`${e.folio||""} ${e.descripcion||""} ${e.tipoEtiqueta||e.tipo?.etiqueta||""}`.toLowerCase();
    return !q||hay.includes(q);
  });
  $("#bitConsultaCount").textContent=`${items.length} evento${items.length===1?"":"s"}`;
  $("#bitEventosList").innerHTML=items.length?items.map(e=>`
    <button class="bitacora-item" type="button" data-bit-id="${esc(e.id||e._id||"")}">
      <span class="bitacora-folio">${esc(e.folio||"—")}</span>
      <span class="bitacora-item-copy"><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"Evento")}</strong><span>${esc(e.descripcion||"")}</span></span>
      <span class="bitacora-item-state">${esc(e.estado||"VIGENTE")}</span>
    </button>`).join(""):'<div class="bitacora-empty">No hay eventos disponibles dentro de tu alcance de consulta.</div>';
}
function renderFollowup(){
  const items=bitState.eventos.filter(e=>e.requiereSeguimiento===true&&String(e.estado||"VIGENTE").toUpperCase()==="VIGENTE");
  $("#bitSeguimientoList").innerHTML=items.length?items.map(e=>`
    <button class="bitacora-item" type="button" data-bit-id="${esc(e.id||e._id||"")}">
      <span class="bitacora-folio">${esc(e.folio||"—")}</span>
      <span class="bitacora-item-copy"><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"Evento")}</strong><span>${esc(e.descripcion||"")}</span></span>
      <span class="bitacora-item-state">SEGUIMIENTO</span>
    </button>`).join(""):'<div class="bitacora-empty">No hay eventos que requieran seguimiento dentro de tu alcance.</div>';
}
function openDetail(id){
  const e=bitState.eventos.find(x=>String(x.id||x._id||"")===String(id||""));
  if(!e)return;
  ["#bitRegistroView","#bitConsultaView","#bitSeguimientoView"].forEach(s=>$(s).hidden=true);
  $("#bitDetalle").innerHTML=`
    <div class="bitacora-detail-row"><span>Folio</span><strong>${esc(e.folio||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Tipo</span><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Evento</span><strong>${esc(e.fechaHoraEvento||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Registrado</span><strong>${esc(e.fechaHoraRegistro||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Descripción</span><strong>${esc(e.descripcion||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Comentarios</span><strong>${esc(e.comentarios||"—")}</strong></div>
    <div class="bitacora-detail-row"><span>Estado</span><strong>${esc(e.estado||"VIGENTE")}</strong></div>`;
  $("#bitDetalleView").hidden=false;
}
function applyCapabilities(){
  $("#btnBitRegistro").hidden=bitState.facultades.registro!==true;
  $("#btnBitConsulta").hidden=bitState.facultades.consulta!==true;
  $("#btnBitSeguimiento").hidden=bitState.facultades.seguimiento!==true;
  $("#bitEvidenciaField").hidden=bitState.evidencias!==true;
}
export function setBitacoraContext(context){bitContext=context||null}
export function setBitacoraState(next={}){
  bitState={
    tipos:Array.isArray(next.tipos)?next.tipos:[],
    eventos:Array.isArray(next.eventos)?next.eventos:[],
    facultades:{...bitState.facultades,...(next.facultades||{})},
    evidencias:next.evidencias===true
  };
  fillTypes();applyCapabilities();renderEvents();renderFollowup();
}
export function openBitacora(){
  if(bitContext?.authenticated!==true)return;
  const n=nowLocal();$("#bitFecha").value=n.fecha;$("#bitHora").value=n.hora;
  $("#bitacoraModal").hidden=false;
  const first=bitState.facultades.registro===true?"registro":bitState.facultades.consulta===true?"consulta":"seguimiento";
  setTab(first);
}
export function initBitacora(){
  const modal=$("#bitacoraModal");if(!modal)return;
  $("#btnCloseBitacora").addEventListener("click",()=>modal.hidden=true);
  modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)modal.hidden=true});
  $("#btnBitRegistro").addEventListener("click",()=>setTab("registro"));
  $("#btnBitConsulta").addEventListener("click",()=>{setTab("consulta");renderEvents()});
  $("#btnBitSeguimiento").addEventListener("click",()=>{setTab("seguimiento");renderFollowup()});
  $("#btnBitBack").addEventListener("click",()=>setTab("consulta"));
  $("#bitBuscar").addEventListener("input",renderEvents);
  $("#bitFiltroTipo").addEventListener("change",renderEvents);
  $("#bitMostrarSustituidos").addEventListener("change",renderEvents);
  $("#bitEventosList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});
  $("#bitSeguimientoList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId)});
  $("#btnBitGuardar").addEventListener("click",()=>{
    document.dispatchEvent(new CustomEvent("nexus:bitacora-save",{detail:{
      tipoId:String($("#bitTipo").value||""),
      fecha:String($("#bitFecha").value||""),
      hora:String($("#bitHora").value||""),
      descripcion:String($("#bitDescripcion").value||"").trim(),
      comentarios:String($("#bitComentarios").value||"").trim(),
      requiereSeguimiento:$("#bitRequiereSeguimiento").checked===true,
      evidencias:Array.from($("#bitEvidencias")?.files||[])
    }}));
  });
  setBitacoraState({});
}
