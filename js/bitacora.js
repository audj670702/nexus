import {createLocalId,putQueueItem,listQueueItems,putEvidence,listEvidence,deleteEvidence,putReference,getReference} from "./local-first.js";
import {showNotice} from "./ui.js";

let bitContext=null;
let bitState={tipos:[],eventos:[],seguimientoEventos:[],facultades:{registro:false,consulta:false,consultaAmpliada:false,seguimiento:false},evidencias:false};
let selectedEvidence=[];
let lockedLocalId="";
let selectedProgramacionId="";
let selectedDetailEvent=null;
let selectedDetailOrigin="consulta";
let bitFollowupSort={id:"fecha",dir:"DESC"};
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
function activityTime(a){const raw=a?.inicio||a?.fechaInicio||a?.fecha||a?.start||"";if(!raw)return "—";const d=new Date(raw);return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false})}
function activityTitle(a){return String(a?.titulo||a?.nombre||a?.actividad||"Actividad")}
function activityType(a){return String(a?.tipoActividad||a?.tipoEtiqueta||a?.tipo||"")}
function programacionItems(){return (Array.isArray(bitContext?.actividades)?bitContext.actividades:[]).slice().sort((a,b)=>{const ad=new Date(a?.inicio||a?.fechaInicio||a?.fecha||a?.start||0).getTime()||0,bd=new Date(b?.inicio||b?.fechaInicio||b?.fecha||b?.start||0).getTime()||0;return ad-bd||activityTitle(a).localeCompare(activityTitle(b),"es")})}
function selectedActivity(){return programacionItems().find(a=>String(a?.id||a?._id||"")===selectedProgramacionId)||null}
function paintProgramacionSelection(){const el=$("#bitRelacionResumen");if(!el)return;const a=selectedActivity();el.textContent=a?`${activityTime(a)} · ${activityTitle(a)}`:"Seleccionar actividad"}
function fillProgramacionFilters(){const type=$("#bitRelacionTipo");if(!type)return;const current=type.value,types=[...new Set(programacionItems().map(activityType).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));type.innerHTML='<option value="">Todos</option>'+types.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(types.includes(current))type.value=current}
// v0.3.8 · Una actividad aparece en un día si empieza ese día o si su periodo lo abarca.
function activityEndDate(a){const raw=a?.fin||a?.fechaFin||a?.end||"";if(!raw)return activityDate(a);const d=new Date(raw);if(Number.isNaN(d.getTime()))return activityDate(a);const pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function activityCoversDate(a,date){const s=activityDate(a);if(!s)return false;const e=activityEndDate(a)||s;return s<=date&&date<=(e<s?s:e)}
function renderProgramacionPicker(){const list=$("#bitRelacionLista");if(!list)return;const all=$("#bitRelacionTodas")?.checked===true,date=String($("#bitRelacionFecha")?.value||""),type=String($("#bitRelacionTipo")?.value||""),q=norm($("#bitRelacionBuscar")?.value);const items=programacionItems().filter(a=>{if(!all&&date&&!activityCoversDate(a,date))return false;if(type&&activityType(a)!==type)return false;return !q||norm(`${activityTitle(a)} ${activityType(a)} ${a?.descripcion||""}`).includes(q)});$("#bitRelacionCount").textContent=`${items.length} actividad${items.length===1?"":"es"}`;list.innerHTML=items.length?items.map(a=>{const id=String(a?.id||a?._id||""),meta=[activityType(a),activityDate(a)].filter(Boolean).join(" · ");return `<button class="bit-relation-item" type="button" data-programacion-id="${esc(id)}"><span class="bit-relation-time">${esc(activityTime(a))}</span><span class="bit-relation-copy"><strong>${esc(activityTitle(a))}</strong><span>${esc(meta)}</span></span></button>`}).join(""):'<div class="bit-relation-empty">No hay actividades para los filtros seleccionados.</div>'}
function openProgramacionPicker(){const modal=$("#bitRelacionModal");if(!modal)return;fillProgramacionFilters();$("#bitRelacionBuscar").value="";$("#bitRelacionTodas").checked=false;$("#bitRelacionFecha").value=String($("#bitFecha")?.value||nowLocal().fecha);renderProgramacionPicker();modal.hidden=false}
function closeProgramacionPicker(){const modal=$("#bitRelacionModal");if(modal)modal.hidden=true}
function fillTypes(){
  const active=bitState.tipos.filter(t=>t?.activo!==false);
  const options=active.map(t=>`<option value="${esc(t.id||t._id||t.clave||"")}">${esc(t.etiqueta||t.nombre||t.clave||"Tipo")}</option>`).join("");
  $("#bitTipo").innerHTML='<option value="">Seleccionar tipo</option>'+options;
  $("#bitFiltroTipo").innerHTML='<option value="">Todos los tipos</option>'+options;
}
const BIT_EVENT_COLUMNS=[
  {id:"fecha",label:"Fecha"},{id:"hora",label:"Hora"},{id:"tipo",label:"Tipo"},{id:"descripcion",label:"Descripción"},
  {id:"lugar",label:"Lugar"},{id:"comentarios",label:"Comentarios"},{id:"responsable",label:"Responsable"},
  {id:"actividad",label:"Actividad"},{id:"seguimiento",label:"Seguimiento"},{id:"fechaRegistro",label:"Fecha registro"}
];
let bitReportColumns=["fecha","hora","tipo","descripcion"];
let bitSort={id:"fecha",dir:"DESC"};
function eventDate(e){const raw=e?.fechaHoraEvento||e?.fechaEvento||e?.fecha||"";const d=raw?new Date(raw):null;return d&&!Number.isNaN(d.getTime())?d:null}
function eventActivity(e){
  const direct=String(e?.actividadProgramada||e?.actividadNombre||e?.programacionNombre||e?.actividad?.titulo||e?.programacion?.titulo||"").trim();
  if(direct)return direct;
  const id=String(e?.programacionId||e?.actividadId||"").trim();if(!id)return "";
  const a=programacionItems().find(x=>String(x?.id||x?._id||"")===id);return a?activityTitle(a):"";
}
function eventRegister(e){const folio=String(e?.folio||e?.codigo||"").trim(),m=folio.match(/(\d+)$/);return m?m[1].padStart(4,"0").slice(-4):(folio||"—")}
function isTipEvent(e){return e?.esTip===true||e?.tip===true||String(e?.clasificacion||e?.tipoRegistro||"").toUpperCase()==="TIP"}
function tipReadForSession(e){return e?.tipConsultadaUsuario===true||e?.tipConsultada===true||["CONSULTADA","LEIDA","REVISADA"].includes(String(e?.tipEstadoUsuario||e?.estadoTipUsuario||"").toUpperCase())}
function eventClassState(e){if(!isTipEvent(e))return "REGULAR";return tipReadForSession(e)?"TIP_CONSULTADA":"TIP_PENDIENTE"}
function eventStateSymbol(e){const s=eventClassState(e);return s==="REGULAR"?"■":s==="TIP_CONSULTADA"?"○":"●"}
function eventStateHtml(e){const s=eventClassState(e),cls=s==="REGULAR"?"regular":s==="TIP_CONSULTADA"?"tip-read":"tip-pending";return `<span class="bit-state-cell" title="${s==="REGULAR"?"Regular":s==="TIP_CONSULTADA"?"TIP consultada por el usuario en sesión":"TIP pendiente para el usuario en sesión"}"><i class="bit-status-symbol ${cls}" aria-hidden="true"></i></span>`}
function eventColumnValue(e,id){
  const d=eventDate(e);
  if(id==="fecha")return d?d.toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}):"—";
  if(id==="hora")return d?d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}):"—";
  if(id==="tipo")return String(e?.tipoEtiqueta||e?.tipo?.etiqueta||"—");
  if(id==="descripcion")return String(e?.descripcion||"—");
  if(id==="lugar")return String(e?.lugar||"—");
  if(id==="comentarios")return String(e?.comentarios||"—");
  if(id==="responsable")return String(e?.registranteNombre||e?.responsableRegistro||"—");
  if(id==="actividad")return eventActivity(e)||"—";
  if(id==="seguimiento")return e?.requiereSeguimiento===true?"Requerido":"No requerido";
  if(id==="fechaRegistro")return fmt(e?.fechaHoraRegistro);
  return "—";
}
function renderColumnSelector(){
  const box=$("#bitColumnasOpciones");if(!box)return;
  box.innerHTML=BIT_EVENT_COLUMNS.map(c=>`<label><input type="checkbox" data-bit-column="${esc(c.id)}" ${bitReportColumns.includes(c.id)?"checked":""}><span>${esc(c.label)}</span></label>`).join("");
}
function compareReportValues(a,b,id){
  if(id==="fecha"||id==="hora"){const ad=eventDate(a)?.getTime()||0,bd=eventDate(b)?.getTime()||0;return ad-bd}
  return eventColumnValue(a,id).localeCompare(eventColumnValue(b,id),"es",{numeric:true,sensitivity:"base"});
}
function sortReportItems(items){const id=bitSort.id,dir=bitSort.dir==="ASC"?1:-1;return items.slice().sort((a,b)=>{const c=compareReportValues(a,b,id);return c*dir||String(a?.folio||"").localeCompare(String(b?.folio||""),"es",{numeric:true,sensitivity:"base"})})}
function sortButton(id,label){const active=bitSort.id===id,arrow=active?(bitSort.dir==="ASC"?"↑":"↓"):"↕";return `<button class="bit-sort-head ${active?"is-active":""}" type="button" data-bit-sort="${esc(id)}" data-bit-col="${esc(id)}" title="Ordenar ${esc(label)}">${esc(label)} <span>${arrow}</span></button>`}
function filteredEvents(){
  const rawQ=String($("#bitBuscar")?.value||"").trim(),q=rawQ.length>=3?norm(rawQ):"";
  const tipo=String($("#bitFiltroTipo")?.value||""),desde=String($("#bitFiltroDesde")?.value||""),hasta=String($("#bitFiltroHasta")?.value||"");
  const responsable=norm($("#bitFiltroResponsable")?.value),actividad=norm($("#bitFiltroActividad")?.value),estado=String($("#bitFiltroEstado")?.value||"VIGENTE"),tip=String($("#bitFiltroTip")?.value||"");
  return sortReportItems(bitState.eventos.filter(e=>{
    const eEstado=String(e?.estado||"VIGENTE").toUpperCase();
    if(estado==="VIGENTE"&&eEstado==="SUSTITUIDO")return false;if(estado==="SUSTITUIDO"&&eEstado!=="SUSTITUIDO")return false;
    if(tipo&&String(e?.tipoId||e?.tipo?.id||"")!==tipo)return false;
    const d=eventDate(e),ymd=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:"";
    if(desde&&(!ymd||ymd<desde))return false;if(hasta&&(!ymd||ymd>hasta))return false;
    const resp=norm(e?.registranteNombre||e?.responsableRegistro||"");if(responsable&&resp!==responsable)return false;
    const act=norm(eventActivity(e));if(actividad&&act!==actividad)return false;
    const cls=eventClassState(e);if(tip==="REGULAR"&&cls!=="REGULAR")return false;if(tip==="TIP"&&cls==="REGULAR")return false;if(tip==="TIP_PENDIENTE"&&cls!=="TIP_PENDIENTE")return false;if(tip==="TIP_CONSULTADA"&&cls!=="TIP_CONSULTADA")return false;
    if(!q)return true;
    const hay=norm(`${e?.folio||""} ${e?.lugar||""} ${e?.descripcion||""} ${e?.comentarios||""} ${e?.tipoEtiqueta||e?.tipo?.etiqueta||""} ${e?.registranteNombre||""} ${eventActivity(e)} ${e?.estado||""}`);
    return hay.includes(q);
  }));
}
function updateTipFilterIcon(){const el=$("#bitFiltroTipIcon"),v=String($("#bitFiltroTip")?.value||"");if(!el)return;el.className="bit-filter-state-icon";if(v==="REGULAR")el.classList.add("regular");else if(v==="TIP_PENDIENTE"||v==="TIP")el.classList.add("tip-pending");else if(v==="TIP_CONSULTADA")el.classList.add("tip-read");else el.classList.add("none")}
function reportGridTracks(){const map={fecha:"96px",hora:"82px",tipo:"130px",descripcion:"minmax(260px,1fr)",lugar:"150px",comentarios:"minmax(240px,1fr)",responsable:"160px",actividad:"190px",seguimiento:"115px",fechaRegistro:"145px"};return bitReportColumns.map(id=>map[id]||"minmax(120px,1fr)").join(" ")}
// v0.3.9 · Listado de Consulta como tabla: cada columna toma el ancho de su contenido.
function fillSelectOptions(sel,values,allLabel){const el=$(sel);if(!el)return;const cur=el.value,key=values.join("\u0001");if(el.dataset.key===key)return;el.dataset.key=key;el.innerHTML=`<option value="">${esc(allLabel)}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");el.value=values.includes(cur)?cur:""}
function uniqueSorted(list){return [...new Set(list.map(v=>String(v||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}))}
function fillConsultaOptions(){fillSelectOptions("#bitFiltroResponsable",uniqueSorted(bitState.eventos.map(e=>e?.registranteNombre||e?.responsableRegistro)),"Todos");fillSelectOptions("#bitFiltroActividad",uniqueSorted(bitState.eventos.map(eventActivity)),"Todas")}
function paintLegendFilter(){const v=String($("#bitFiltroTip")?.value||"");document.querySelectorAll("[data-bit-class]").forEach(b=>{const c=b.dataset.bitClass,on=v===c||(v==="TIP"&&c.startsWith("TIP"));b.classList.toggle("is-on",on);b.setAttribute("aria-pressed",String(on))});const box=$(".bit-legend-filter");if(box)box.classList.toggle("has-filter",!!v)}
function toggleLegendFilter(cls){const el=$("#bitFiltroTip");if(!el)return;el.value=el.value===cls?"":cls;renderEvents()}
const BIT_COL_CLASS={fecha:"c-nowrap",hora:"c-nowrap",tipo:"c-short",descripcion:"c-text",lugar:"c-short",comentarios:"c-text",responsable:"c-short",actividad:"c-mid",seguimiento:"c-nowrap",fechaRegistro:"c-nowrap"};
function tableValue(e,id){const d=eventDate(e);if(id==="hora")return d?d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false}):"—";if(id==="seguimiento")return e?.requiereSeguimiento===true?"Requerido":"No";if(id==="fechaRegistro"){const r=e?.fechaHoraRegistro?new Date(e.fechaHoraRegistro):null;return r&&!Number.isNaN(r.getTime())?`${r.toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"2-digit"})} ${r.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",hour12:false})}`:"—"}return eventColumnValue(e,id)}
function updateMoreColumns(){const wrap=$("#bitEventosList .bit-tbl-scroll"),btn=$("#bitTblMore");if(!btn)return;if(!wrap){btn.hidden=true;return}const view=wrap.getBoundingClientRect(),cells=[...wrap.querySelectorAll("thead th")];const hidden=cells.filter(th=>th.getBoundingClientRect().right>view.right+2).length;const atEnd=wrap.scrollLeft+wrap.clientWidth>=wrap.scrollWidth-2;wrap.classList.toggle("has-more",!atEnd);if(hidden>0&&!atEnd){btn.hidden=false;btn.innerHTML=`<span>+${hidden} columna${hidden===1?"":"s"}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`;btn.setAttribute("aria-label",`Hay ${hidden} columna${hidden===1?"":"s"} más a la derecha`)}else btn.hidden=true}
function activeFilterCount(){const v=id=>String($(id)?.value||"");let n=0;if(v("#bitFiltroDesde")||v("#bitFiltroHasta"))n++;["#bitFiltroTipo","#bitFiltroResponsable","#bitFiltroActividad","#bitFiltroTip"].forEach(id=>{if(v(id))n++});if(v("#bitFiltroEstado")&&v("#bitFiltroEstado")!=="VIGENTE")n++;return n}
function paintFilterBadge(){const b=$("#btnBitFiltros");if(!b)return;const n=activeFilterCount();b.innerHTML=`Filtros${n?` <span class="bit-filter-badge">${n}</span>`:""}`;b.classList.toggle("has-active",n>0);const clr=$("#btnBitLimpiarFiltros");if(clr)clr.disabled=n===0&&!String($("#bitBuscar")?.value||"").trim()}
function renderEvents(){
  updateTipFilterIcon();fillConsultaOptions();paintLegendFilter();paintFilterBadge();
  const items=filteredEvents(),total=bitState.eventos.length,own=bitState.facultades.consultaAmpliada!==true;
  $("#bitConsultaCount").textContent=`${items.length===total?"":`${items.length} de `}${total} evento${total===1?"":"s"}${own?" · sólo tus registros":""}`;
  if(bitState.loadError&&!total){$("#bitEventosList").innerHTML=`<div class="bitacora-empty bit-load-error"><strong>No se pudieron cargar los eventos.</strong><span>${esc(bitState.loadError)}</span><button type="button" class="bit-consulta-tool" data-bit-reload>Reintentar</button></div>`;updateMoreColumns();return}
  if(!items.length){$("#bitEventosList").innerHTML=`<div class="bitacora-empty">${total?"No hay eventos para los filtros seleccionados.":"Aún no hay eventos dentro de tu alcance de consulta."}</div>`;updateMoreColumns();return}
  const th=id=>{const label=BIT_EVENT_COLUMNS.find(c=>c.id===id)?.label||id,active=bitSort.id===id,arrow=active?(bitSort.dir==="ASC"?"↑":"↓"):"";return `<th class="${BIT_COL_CLASS[id]||""}" data-bit-col="${esc(id)}"><button type="button" class="bit-sort-head ${active?"is-active":""}" data-bit-sort="${esc(id)}" title="Ordenar por ${esc(label)}">${esc(label)}${arrow?` <span>${arrow}</span>`:""}</button></th>`};
  const rows=items.map((e,i)=>`<tr data-bit-id="${esc(e.id||e._id||"")}" tabindex="0"><td class="c-num">${i+1}</td><td class="c-reg">${esc(eventRegister(e))}</td><td class="c-state">${eventStateHtml(e)}</td>${bitReportColumns.map(id=>`<td class="${BIT_COL_CLASS[id]||""}" data-bit-col="${esc(id)}"><span>${esc(tableValue(e,id))}</span></td>`).join("")}</tr>`).join("");
  $("#bitEventosList").innerHTML=`<div class="bit-tbl-scroll"><table class="bit-tbl"><thead><tr><th class="c-num">No.</th><th class="c-reg">Reg.</th><th class="c-state" aria-label="Clasificación"></th>${bitReportColumns.map(th).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const wrap=$("#bitEventosList .bit-tbl-scroll");wrap?.addEventListener("scroll",updateMoreColumns,{passive:true});requestAnimationFrame(updateMoreColumns);
}
function reportTitle(){return `BITÁCORA · ${String(bitContext?.eo?.nombreMostrar||bitContext?.eo?.nombre||bitContext?.eo?.codigoEO||"")}`}
function reportNotes(){return String($("#bitReporteAnotaciones")?.value||"").trim()}
function reportFiltersText(){
  const parts=[],q=String($("#bitBuscar")?.value||"").trim();if(q.length>=3)parts.push(`Búsqueda: ${q}`);
  const desde=$("#bitFiltroDesde")?.value,hasta=$("#bitFiltroHasta")?.value;if(desde||hasta)parts.push(`Fecha: ${desde||"inicio"} a ${hasta||"actual"}`);
  const tipo=$("#bitFiltroTipo")?.selectedOptions?.[0]?.textContent;if($("#bitFiltroTipo")?.value)parts.push(`Tipo: ${tipo}`);
  const r=String($("#bitFiltroResponsable")?.value||"").trim(),a=String($("#bitFiltroActividad")?.value||"").trim();if(r)parts.push(`Responsable: ${r}`);if(a)parts.push(`Actividad: ${a}`);
  return parts.length?parts.join(" · "):"Sin filtros adicionales";
}
function reportMatrix(){
  const items=filteredEvents(),headers=["No.","Reg.","Estado",...bitReportColumns.map(id=>BIT_EVENT_COLUMNS.find(c=>c.id===id)?.label||id)];
  const rows=items.map((e,i)=>[String(i+1),eventRegister(e),eventStateSymbol(e),...bitReportColumns.map(id=>eventColumnValue(e,id))]);
  return {items,headers,rows};
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function eoAvatarUrl(){const eo=bitContext?.eo||{},raw=eo.logoEo||eo.logoEO||eo.logo||eo.logoUrl||eo.imageUrl||"";if(!raw)return "";if(typeof raw==="object")return String(raw.url||raw.src||raw.imageUrl||raw.fileUrl||"");const s=String(raw).trim();if(s.startsWith("wix:image://v1/")){const id=s.slice("wix:image://v1/".length).split("/")[0];return id?`https://static.wixstatic.com/media/${id}`:""}return s}
function exportExcel(){
  const {items,headers,rows}=reportMatrix();if(!items.length){showNotice("No hay registros para exportar.");return}
  const user=String(bitContext?.user?.nombreVisible||bitContext?.user?.nombre||bitContext?.email||"Usuario");
  const tr=row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join("")}</tr>`;
  const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><table><tr><th colspan="${headers.length}">${esc(reportTitle())}</th></tr><tr><td colspan="${headers.length}">${esc(reportFiltersText())}</td></tr><tr><td colspan="${headers.length}">■ Regular · ● TIP pendiente · ○ TIP consultada. TIP consultada respecto al usuario en sesión: ${esc(user)}.</td></tr><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr>${rows.map(tr).join("")}</table></body></html>`;
  downloadBlob(new Blob(["\ufeff",html],{type:"application/vnd.ms-excel;charset=utf-8"}),`BIT_reporte_${nowLocal().fecha}.xls`);
}
async function loadJsPdf(){
  if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
  await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";s.onload=resolve;s.onerror=()=>reject(new Error("No fue posible cargar el generador PDF."));document.head.appendChild(s)});
  await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js";s.onload=resolve;s.onerror=()=>reject(new Error("No fue posible cargar la tabla PDF."));document.head.appendChild(s)});
  return window.jspdf?.jsPDF;
}
async function imageDataUrl(url){
  if(!url)return "";try{const r=await fetch(url,{mode:"cors",cache:"force-cache"});if(!r.ok)return "";const b=await r.blob();return await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result||""));fr.onerror=reject;fr.readAsDataURL(b)})}catch(_){return ""}
}
async function exportPdf(){
  const {items,headers,rows}=reportMatrix();if(!items.length){showNotice("No hay registros para exportar.");return}
  try{
    const JsPDF=await loadJsPdf();if(!JsPDF)throw new Error("Generador PDF no disponible.");
    const doc=new JsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    const eo=bitContext?.eo||{},usr=bitContext?.user||{};
    const eoName=String(eo?.nombreMostrar||eo?.nombreVisible||eo?.nombre||eo?.codigoEO||"Empresa operadora");
    const user=String(usr?.nombreMostrar||usr?.nombreVisible||usr?.nombre||bitContext?.email||"Usuario");
    const userAvatarRaw=usr?.avatar||usr?.avatarUrl||usr?.foto||usr?.fotoPerfil||usr?.imageUrl||usr?.profileImage||"";
    const userAvatarUrl=(()=>{if(!userAvatarRaw)return "";if(typeof userAvatarRaw==="object")return String(userAvatarRaw.url||userAvatarRaw.src||userAvatarRaw.imageUrl||userAvatarRaw.fileUrl||"");const s=String(userAvatarRaw).trim();if(s.startsWith("wix:image://v1/")){const id=s.slice("wix:image://v1/".length).split("/")[0];return id?`https://static.wixstatic.com/media/${id}`:""}return s})();
    const generatedAt=new Date(),reportDate=generatedAt.toLocaleString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const notes=reportNotes(),filters=reportFiltersText(),hasFilters=filters&&filters!=="Sin filtros adicionales";
    const eoLogo=await imageDataUrl(eoAvatarUrl());
    const userAvatar=await imageDataUrl(userAvatarUrl);
    const nexusLogo=await imageDataUrl(new URL("./assets/logo/logo_nexus_192.png",window.location.href).href);
    let titleX=14;
    if(eoLogo){try{doc.addImage(eoLogo,eoLogo.startsWith("data:image/png")?"PNG":"JPEG",14,9,17,17);titleX=35}catch(_){}}
    doc.setTextColor(31,41,55);doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text(eoName,titleX,15);
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(32,89,133);doc.text("Reporte de Bitácora",titleX,21);
    let y=31;
    if(userAvatar){try{doc.addImage(userAvatar,userAvatar.startsWith("data:image/png")?"PNG":"JPEG",14,y-4,10,10)}catch(_){}}
    const identityX=userAvatar?27:14;
    doc.setTextColor(95);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("Generado por",identityX,y);
    doc.setTextColor(31,41,55);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(user,identityX,y+4);
    doc.setTextColor(95);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text(`Fecha del reporte: ${reportDate}`,identityX,y+8);
    y+=14;
    if(hasFilters){doc.setTextColor(85);doc.setFontSize(7.5);doc.text(filters,14,y,{maxWidth:269});y+=6}
    if(notes){doc.setTextColor(30);doc.setFontSize(8);doc.text("Anotaciones:",14,y);const lines=doc.splitTextToSize(notes,255);doc.setFont("helvetica","normal");doc.text(lines,34,y);y+=Math.max(8,lines.length*4)}
    const drawStatus=(x,cy,state,size=1.5)=>{
      if(state==="REGULAR"){doc.setFillColor(31,41,55);doc.rect(x-size,cy-size,size*2,size*2,"F");return}
      if(state==="TIP_PENDIENTE"){doc.setFillColor(190,35,35);doc.circle(x,cy,size,"F");return}
      doc.setDrawColor(32,89,133);doc.setLineWidth(.45);doc.circle(x,cy,size,"S");
    };
    doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(75);
    let lx=15;drawStatus(lx,y-1.1,"REGULAR",1.35);doc.text("Regular",lx+3.5,y);lx+=25;
    drawStatus(lx,y-1.1,"TIP_PENDIENTE",1.35);doc.text("TIP pendiente",lx+3.5,y);lx+=35;
    drawStatus(lx,y-1.1,"TIP_CONSULTADA",1.35);doc.text("TIP consultada",lx+3.5,y);
    doc.setTextColor(95);doc.text(`TIP consultada respecto al usuario en sesión: ${user}.`,lx+32,y);y+=5;
    const tableRows=items.map((e,i)=>[String(i+1),eventRegister(e),"",...bitReportColumns.map(id=>eventColumnValue(e,id))]);
    doc.autoTable({
      startY:y,head:[headers],body:tableRows,
      styles:{fontSize:6.5,cellPadding:1.8,overflow:"linebreak",valign:"top"},
      headStyles:{fontStyle:"bold"},margin:{left:14,right:14,bottom:15},
      didDrawCell:data=>{
        if(data.section!=="body"||data.column.index!==2)return;
        const e=items[data.row.index];if(!e)return;
        const state=eventClassState(e),cx=data.cell.x+data.cell.width/2,cy=data.cell.y+data.cell.height/2;
        drawStatus(cx,cy,state,1.35);
      }
    });
    const pages=doc.getNumberOfPages();
    for(let p=1;p<=pages;p++){
      doc.setPage(p);
      const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight(),fy=pageH-7;
      doc.setDrawColor(223,229,236);doc.setLineWidth(.25);doc.line(14,fy-4,pageW-14,fy-4);
      doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(102,112,133);
      doc.text("Powered by",14,fy);
      if(nexusLogo){try{doc.addImage(nexusLogo,nexusLogo.startsWith("data:image/png")?"PNG":"JPEG",31,fy-4.2,13,7)}catch(_){}}
      else{doc.setFont("helvetica","bold");doc.setTextColor(32,89,133);doc.text("NEXUS",31,fy)}
      doc.setFont("helvetica","normal");doc.setTextColor(102,112,133);doc.text(`${p}/${pages}`,pageW-14,fy,{align:"right"});
    }
    doc.save(`BIT_reporte_${nowLocal().fecha}.pdf`);
  }catch(error){showNotice(error?.message||"No fue posible generar el PDF.")}
}
function followupSource(e){return String(e?.fuente||"BIT").toUpperCase()==="CTE"?"CTE":"BIT"}
function followupState(e){return String(e?.seguimientoEstado||"SIN_ASIGNAR").toUpperCase()}
function followupStateLabel(e){const s=followupState(e);return s==="ATENDIDO"?"Atendido":s==="EN_SEGUIMIENTO"?"En proceso":"Sin asignar"}
function followupCurrentUserIsAssignee(e){const uid=String(bitContext?.user?._id||bitContext?.user?.id||"").trim(),mid=String(bitContext?.memberId||"").trim(),a=e?.asignacionActual||{};return (!!uid&&String(a?.asignadoUsrId||"")===uid)||(!!mid&&String(a?.asignadoMemberId||"")===mid)}
function followupSortValue(e,id){
  if(id==="estado")return followupStateLabel(e);if(id==="fuente")return followupSource(e);if(id==="reg")return eventRegister(e);
  if(id==="fecha")return eventDate(e)?.getTime()||0;if(id==="tipo")return String(e?.tipoEtiqueta||e?.tipo?.etiqueta||"");
  if(id==="asignado")return String(e?.asignacionActual?.asignadoNombre||"Sin asignar");return "";
}
function followupSortButton(id,label){const active=bitFollowupSort.id===id,arrow=active?(bitFollowupSort.dir==="ASC"?"↑":"↓"):"↕";return `<button type="button" data-bit-followup-sort="${esc(id)}" class="${active?"is-active":""}" title="Ordenar ${esc(label)}">${esc(label)} <span>${arrow}</span></button>`}
function filteredFollowups(){
  const source=String($("#bitSeguimientoFuente")?.value||"TODOS").toUpperCase(),raw=String($("#bitSeguimientoBuscar")?.value||"").trim(),q=raw.length>=3?norm(raw):"";
  const estado=String($("#bitSeguimientoEstado")?.value||"TODOS").toUpperCase();
  const items=bitState.seguimientoEventos.filter(e=>{
    if(source!=="TODOS"&&followupSource(e)!==source)return false;
    const st=followupState(e);
    if(estado==="ABIERTOS"&&st==="ATENDIDO")return false;if(estado==="SIN_ASIGNAR"&&st!=="SIN_ASIGNAR")return false;if(estado==="EN_SEGUIMIENTO"&&st!=="EN_SEGUIMIENTO")return false;if(estado==="ATENDIDO"&&st!=="ATENDIDO")return false;
    if(estado==="MIOS"&&!(st==="EN_SEGUIMIENTO"&&followupCurrentUserIsAssignee(e)))return false;
    if(!q)return true;
    return norm(`${followupStateLabel(e)} ${followupSource(e)} ${eventRegister(e)} ${eventColumnValue(e,"fecha")} ${e?.tipoEtiqueta||e?.tipo?.etiqueta||""} ${e?.descripcion||""} ${e?.asignacionActual?.asignadoNombre||"Sin asignar"}`).includes(q);
  });
  const id=bitFollowupSort.id,dir=bitFollowupSort.dir==="ASC"?1:-1;
  return items.slice().sort((a,b)=>{const av=followupSortValue(a,id),bv=followupSortValue(b,id);const cmp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),"es",{numeric:true,sensitivity:"base"});return cmp*dir||String(eventRegister(a)).localeCompare(String(eventRegister(b)),"es",{numeric:true,sensitivity:"base"})});
}
// v0.3.12 · Seguimiento en modo tabla (mismo estilo que Consultar).
function followupTh(id,label,cls=""){const active=bitFollowupSort.id===id,arrow=active?(bitFollowupSort.dir==="ASC"?"↑":"↓"):"";return `<th class="${cls}"><button type="button" class="bit-sort-head ${active?"is-active":""}" data-bit-followup-sort="${esc(id)}" title="Ordenar por ${esc(label)}">${esc(label)}${arrow?` <span>${arrow}</span>`:""}</button></th>`}
function updateSegMore(){const wrap=$("#bitSeguimientoList .bit-tbl-scroll"),btn=$("#bitSegMore");if(!btn)return;if(!wrap){btn.hidden=true;return}const view=wrap.getBoundingClientRect();const hidden=[...wrap.querySelectorAll("thead th")].filter(th=>th.getBoundingClientRect().right>view.right+2).length;const atEnd=wrap.scrollLeft+wrap.clientWidth>=wrap.scrollWidth-2;wrap.classList.toggle("has-more",!atEnd);if(hidden>0&&!atEnd){btn.hidden=false;btn.innerHTML=`<span>+${hidden} columna${hidden===1?"":"s"}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`}else btn.hidden=true}
function renderFollowup(){
  const items=filteredFollowups(),total=bitState.seguimientoEventos.length;
  const cnt=$("#bitSeguimientoCount");if(cnt)cnt.textContent=`${items.length===total?"":`${items.length} de `}${total} evento${total===1?"":"s"}`;
  if(!items.length){$("#bitSeguimientoList").innerHTML='<div class="bitacora-empty">No hay eventos que requieran seguimiento para los criterios seleccionados.</div>';updateSegMore();return}
  const rows=items.map(e=>{
    const id=String(e.id||e._id||""),state=followupState(e),assigned=String(e?.asignacionActual?.asignadoNombre||"Sin asignar"),stateClass=state==="ATENDIDO"?"is-attended":state==="EN_SEGUIMIENTO"?"is-progress":"is-unassigned",src=followupSource(e),d=eventDate(e);
    return `<tr data-bit-id="${esc(id)}" tabindex="0"><td class="c-nowrap"><span class="bit-seg-state ${stateClass}">${esc(followupStateLabel(e))}</span></td><td class="c-nowrap"><span class="bit-seg-src ${src==="CTE"?"is-cte":""}">${esc(src)}</span></td><td class="c-reg">${esc(eventRegister(e))}</td><td class="c-nowrap">${esc(d?d.toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"2-digit"}):"—")}</td><td class="c-text"><span><strong>${esc(e.tipoEtiqueta||e.tipo?.etiqueta||(src==="CTE"?"Ticket de cliente":"Evento"))}</strong> · ${esc(e.descripcion||"")}</span></td><td class="c-short ${assigned==="Sin asignar"?"is-muted":""}"><span>${esc(assigned)}</span></td></tr>`;
  }).join("");
  $("#bitSeguimientoList").innerHTML=`<div class="bit-tbl-scroll"><table class="bit-tbl"><thead><tr>${followupTh("estado","Estado")}${followupTh("fuente","Origen")}${followupTh("reg","Reg.","c-reg")}${followupTh("fecha","Fecha")}${followupTh("tipo","Tipo / descripción")}${followupTh("asignado","Asignado")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  $("#bitSeguimientoList .bit-tbl-scroll")?.addEventListener("scroll",updateSegMore,{passive:true});requestAnimationFrame(updateSegMore);
}
function openFollowupAction(kind){
  const e=selectedDetailEvent;if(!e)return;const modal=$("#bitSeguimientoAccionModal"),title=$("#bitSeguimientoAccionTitle"),copy=$("#bitSeguimientoAccionCopy"),note=$("#bitSeguimientoNota"),confirm=$("#btnBitSeguimientoConfirmar");
  const cfg={take:["Tomar","Asignarte la responsabilidad actual de este seguimiento."],note:["Anotar","Incorporar una anotación al historial de seguimiento."],release:["Liberar","Dejar el evento sin responsable para que otro usuario autorizado pueda tomarlo."],attended:["Atendido","Marcar este seguimiento como atendido."]}[kind];if(!cfg||!modal)return;
  modal.dataset.action=kind;title.textContent=cfg[0];copy.textContent=cfg[1];note.hidden=kind!=="note";note.value="";confirm.textContent=kind==="note"?"Guardar":cfg[0];modal.hidden=false;if(kind==="note")note.focus();else confirm.focus();
}
function closeFollowupAction(){const m=$("#bitSeguimientoAccionModal");if(m)m.hidden=true}
function showFollowupMessage(message,title="Seguimiento"){const m=$("#bitSeguimientoMensajeModal");if(!m)return;$("#bitSeguimientoMensajeTitle").textContent=title;$("#bitSeguimientoMensajeCopy").textContent=String(message||"Operación realizada.");m.hidden=false;$("#btnBitSeguimientoMensajeCerrar")?.focus()}
function submitFollowupAction(){
  const modal=$("#bitSeguimientoAccionModal"),kind=String(modal?.dataset.action||""),eventoId=String(selectedDetailEvent?.id||selectedDetailEvent?._id||"");if(!eventoId)return;
  if(kind==="note"){const nota=String($("#bitSeguimientoNota")?.value||"").trim();if(!nota){showFollowupMessage("Escribe una anotación para continuar.");return}document.dispatchEvent(new CustomEvent("nexus:bitacora-followup",{detail:{eventoId,nota}}))}
  if(kind==="take")document.dispatchEvent(new CustomEvent("nexus:bitacora-followup-take",{detail:{eventoId}}));
  if(kind==="release")document.dispatchEvent(new CustomEvent("nexus:bitacora-followup-release",{detail:{eventoId}}));
  if(kind==="attended")document.dispatchEvent(new CustomEvent("nexus:bitacora-followup-attended",{detail:{eventoId}}));
  closeFollowupAction();
}
function renderFollowupDetailActions(e){
  const box=$("#bitDetalleSeguimientoAcciones");if(!box)return;const inFollowup=selectedDetailOrigin==="seguimiento"&&bitState.facultades.seguimiento===true;
  if(!inFollowup){box.hidden=true;box.innerHTML="";return}
  const state=followupState(e),mine=followupCurrentUserIsAssignee(e),buttons=[];
  if(state==="SIN_ASIGNAR")buttons.push('<button type="button" data-detail-followup="take">Tomar</button>');
  if(state!=="ATENDIDO")buttons.push('<button type="button" data-detail-followup="note">Anotar</button>');
  if(mine&&state==="EN_SEGUIMIENTO"){buttons.push('<button type="button" data-detail-followup="release">Liberar</button>');buttons.push('<button type="button" data-detail-followup="attended">Atendido</button>')}
  box.innerHTML=`<span class="bit-detail-followup-label">Seguimiento</span><div>${buttons.join("")}</div>`;box.hidden=!buttons.length;
}
function eventEvidenceList(e){const x=e?.evidencias||e?.evidence||e?.archivos||e?.adjuntos||[];return Array.isArray(x)?x:[]}
function evidenceUrl(x){return typeof x==="string"?x:String(x?.url||x?.fileUrl||x?.downloadUrl||x?.src||"")}
function evidenceIsImage(x){const t=String(x?.type||x?.mimeType||"").toLowerCase(),u=evidenceUrl(x).toLowerCase();return t.startsWith("image/")||/\.(png|jpe?g|webp|gif)(\?|$)/.test(u)}
function renderEventCard(e){
 const cls=eventClassState(e),dot=cls==="REGULAR"?"regular":cls==="TIP_CONSULTADA"?"tip-read":"tip-pending",act=eventActivity(e),ev=eventEvidenceList(e),seg=Array.isArray(e?.seguimientos)?e.seguimientos:[];
 return `<div class="bit-saved-head"><div><i class="bit-status-symbol ${dot}"></i><strong>${isTipEvent(e)?"Tarjeta Informativa Prioritaria":"Registro de Bitácora"}</strong></div><span>Reg. ${esc(eventRegister(e))}</span></div>
 <div class="bit-saved-line"><span>Tipo de evento</span><strong>${esc(e?.tipoEtiqueta||e?.tipo?.etiqueta||"—")}</strong></div>
 <div class="bit-saved-line"><span>Fecha / hora</span><strong>${esc(eventColumnValue(e,"fecha"))} · ${esc(eventColumnValue(e,"hora"))}</strong></div>
 ${act?`<div class="bit-saved-line"><span>Actividad relacionada</span><strong>${esc(act)}</strong></div>`:""}${e?.lugar?`<div class="bit-saved-line"><span>Lugar</span><strong>${esc(e.lugar)}</strong></div>`:""}
 <div class="bit-saved-block"><span>Descripción</span><p>${esc(e?.descripcion||"—")}</p></div>${e?.comentarios?`<div class="bit-saved-block"><span>Comentarios</span><p>${esc(e.comentarios)}</p></div>`:""}
 <div class="bit-saved-line"><span>Responsable del registro</span><strong>${esc(e?.registranteNombre||e?.responsableRegistro||"—")}</strong></div><div class="bit-saved-line"><span>Fecha de registro</span><strong>${esc(fmt(e?.fechaHoraRegistro))}</strong></div>
 ${ev.length?`<div class="bit-card-evidence"><span>Evidencia</span><div>${ev.map((x,i)=>{const u=evidenceUrl(x),n=String(x?.name||x?.nombre||`Evidencia ${i+1}`);return u?(evidenceIsImage(x)?`<img src="${esc(u)}" alt="${esc(n)}">`:`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>`):`<span>${esc(n)}</span>`}).join("")}</div></div>`:""}
 ${seg.length?`<div class="bit-card-section"><strong>Seguimiento</strong>${seg.map(s=>`<div><span>${esc(fmt(s.fechaRegistro))} · ${esc(s.autorNombre||"Usuario")}</span><p>${esc(s.nota||"")}</p></div>`).join("")}</div>`:""}`;
}
async function exportCardPdf(e){
 if(!e)return;
 try{
  const JsPDF=await loadJsPdf();if(!JsPDF)throw new Error("Generador PDF no disponible.");
  const doc=new JsPDF({orientation:"portrait",unit:"mm",format:"a4"}),pageW=210,pageH=297,margin=16,contentW=178;
  const eo=bitContext?.eo||{},eoName=String(eo.nombreMostrar||eo.nombreVisible||eo.nombre||eo.codigoEO||"Empresa operadora");
  const eoLogo=await imageDataUrl(eoAvatarUrl()),nexusLogo=await imageDataUrl("./assets/logo/logo_nexus_192.png");
  const addImg=(data,x,y,w,h)=>{if(!data)return false;try{const fmt=data.startsWith("data:image/png")?"PNG":"JPEG";doc.addImage(data,fmt,x,y,w,h);return true}catch(_){return false}};
  const fitImg=(data,maxW,maxH)=>{try{const p=doc.getImageProperties(data),r=p.width/p.height;let w=maxW,h=w/r;if(h>maxH){h=maxH;w=h*r}return {w,h}}catch(_){return {w:maxW,h:maxH}}};
  const footer=()=>{const y=286;doc.setDrawColor(220);doc.line(margin,y,pageW-margin,y);doc.setTextColor(115);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("Powered by",margin,y+5);if(nexusLogo){const d=fitImg(nexusLogo,24,7);addImg(nexusLogo,margin+16,y+1.2,d.w,d.h)}doc.setTextColor(140);doc.text(`NEXUS · Tarjeta BIT · Reg. ${eventRegister(e)}`,pageW-margin,y+5,{align:"right"})};
  const newPage=()=>{doc.addPage();footer();return 18};
  const ensure=(y,need)=>y+need>280?newPage():y;
  doc.setFillColor(32,89,133);doc.roundedRect(margin,12,contentW,30,3,3,"F");
  if(eoLogo){const d=fitImg(eoLogo,20,20);addImg(eoLogo,20,17+(20-d.h)/2,d.w,d.h)}
  doc.setTextColor(255);doc.setFont("helvetica","bold");doc.setFontSize(16);doc.text(eoName,eoLogo?45:22,25,{maxWidth:142});
  doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text("Tarjeta de Registro en Bitácora",eoLogo?45:22,32);
  doc.setTextColor(32,89,133);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text(`Reg. ${eventRegister(e)}`,pageW-margin,50,{align:"right"});
  let y=54;
  const fields=[
   ["Clasificación",eventClassState(e)==="REGULAR"?"Regular":eventClassState(e)==="TIP_CONSULTADA"?"TIP consultada*":"TIP pendiente"],
   ["Estado del registro",String(e?.estado||"VIGENTE").toUpperCase()],
   ["Tipo de evento",String(e?.tipoEtiqueta||e?.tipo?.etiqueta||"")],
   ["Fecha del evento",eventColumnValue(e,"fecha")==="—"?"":eventColumnValue(e,"fecha")],
   ["Hora",eventColumnValue(e,"hora")==="—"?"":eventColumnValue(e,"hora")],
   ["Actividad relacionada",eventActivity(e)],
   ["Lugar",String(e?.lugar||"")],
   ["Descripción",String(e?.descripcion||"")],
   ["Comentarios",String(e?.comentarios||"")],
   ["Seguimiento requerido",e?.requiereSeguimiento===true?"Sí":"No"],
   ["Responsable del registro",String(e?.registranteNombre||e?.responsableRegistro||"")],
   ["Fecha de registro",e?.fechaHoraRegistro?fmt(e.fechaHoraRegistro):""]
  ];
  const drawField=(label,value,index)=>{
   const val=String(value||"").trim()||"Sin dato registrado",long=["Descripción","Comentarios"].includes(label),boxH=long?Math.max(20,doc.splitTextToSize(val,164).length*4.5+12):16;
   y=ensure(y,boxH+4);doc.setFillColor(index%2?248:244,index%2?250:248,index%2?252:251);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,boxH,2,2,"FD");
   doc.setTextColor(95);doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.text(label,margin+5,y+5.5);
   doc.setTextColor(28);doc.setFont("helvetica","bold");doc.setFontSize(9);
   if(label==="Clasificación"){
    const state=eventClassState(e),cx=margin+5,cy=y+10.7;if(state==="REGULAR"){doc.setFillColor(32);doc.rect(cx,cy-2.2,4.2,4.2,"F")}else if(state==="TIP_CONSULTADA"){doc.setDrawColor(32,89,133);doc.setLineWidth(.8);doc.circle(cx+2.1,cy,2.1,"S")}else{doc.setFillColor(217,47,47);doc.circle(cx+2.1,cy,2.1,"F")}
    doc.text(val,margin+12,y+12);
   }else doc.text(doc.splitTextToSize(val,164),margin+5,y+12);
   y+=boxH+3;
  };
  fields.forEach((f,i)=>drawField(f[0],f[1],i));
  if(eventClassState(e)==="TIP_CONSULTADA"){y=ensure(y,9);doc.setTextColor(90);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text("* TIP consultada respecto al usuario en sesión.",margin+2,y);y+=7}
  const evs=eventEvidenceList(e);
  y=ensure(y,24);doc.setTextColor(32,89,133);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text("Evidencia",margin,y);y+=5;
  if(!evs.length){doc.setFillColor(248,250,252);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,16,2,2,"FD");doc.setTextColor(28);doc.setFontSize(9);doc.text("Sin evidencia registrada",margin+5,y+10);y+=20}
  else{
   for(let i=0;i<evs.length;i++){
    const ev=evs[i],url=evidenceUrl(ev),name=String(ev?.name||ev?.nombre||`Evidencia ${i+1}`);
    if(evidenceIsImage(ev)&&url){
     const data=await imageDataUrl(url);if(data){const d=fitImg(data,contentW-10,105);y=ensure(y,d.h+18);doc.setFillColor(248,250,252);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,d.h+14,2,2,"FD");doc.setTextColor(90);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text(name,margin+5,y+5);addImg(data,margin+(contentW-d.w)/2,y+8,d.w,d.h);y+=d.h+18;continue}
    }
    y=ensure(y,18);doc.setFillColor(248,250,252);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,14,2,2,"FD");doc.setTextColor(28);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(name,margin+5,y+9);y+=18;
   }
  }
  const seg=Array.isArray(e?.seguimientos)?e.seguimientos:[];
  y=ensure(y,24);doc.setTextColor(32,89,133);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text("Seguimiento",margin,y);y+=5;
  if(!seg.length){doc.setFillColor(248,250,252);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,16,2,2,"FD");doc.setTextColor(28);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text("Sin anotaciones de seguimiento",margin+5,y+10)}
  else for(const s of seg){const note=String(s?.nota||"").trim()||"Sin anotación",lines=doc.splitTextToSize(note,164),h=Math.max(19,lines.length*4.2+13);y=ensure(y,h+4);doc.setFillColor(248,250,252);doc.setDrawColor(222,229,236);doc.roundedRect(margin,y,contentW,h,2,2,"FD");doc.setTextColor(95);doc.setFont("helvetica","normal");doc.setFontSize(7);doc.text(`${fmt(s.fechaRegistro)} · ${s.autorNombre||"Usuario"}`,margin+5,y+5.5);doc.setTextColor(28);doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.text(lines,margin+5,y+12);y+=h+3}
  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);footer()}
  doc.save(`BIT_Tarjeta_${eventRegister(e)}.pdf`);
 }catch(err){showNotice(err?.message||"No fue posible generar la Tarjeta PDF.")}
}
function openDetail(id,origin="consulta"){const e=[...bitState.eventos,...bitState.seguimientoEventos].find(x=>String(x.id||x._id||"")===String(id||""));if(!e)return;selectedDetailEvent=e;selectedDetailOrigin=origin;["#bitRegistroView","#bitConsultaView","#bitSeguimientoView"].forEach(s=>$(s).hidden=true);$("#bitDetalle").innerHTML=renderEventCard(e);renderFollowupDetailActions(e);$("#bitDetalleView").hidden=false}
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
  form.dataset.locked=locked?"1":"";
  $("#bitacoraForm")?.toggleAttribute("hidden",locked);
  const formBox=form.querySelector(".bitacora-form");if(formBox)formBox.hidden=locked;
  $("#btnBitGuardar").hidden=locked;$("#btnBitNuevo").hidden=!locked;
  const lock=$("#bitRegistroLock");lock.hidden=!locked;
  $("#bitFolio").innerHTML=`<small>Folio</small><strong>${esc(folio?folio:(locked?"Pendiente":"—"))}</strong>`;$("#bitFolio").title=folio?"":(locked?"Pendiente de sincronización":"");
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
  if(!detail.tipoId||!detail.fecha||!detail.hora||!detail.descripcion){showNotice("Completa Tipo de evento, fecha, hora y descripción.");return}
  // Zona horaria del dispositivo para la fecha/hora capturada (el servidor trabaja en UTC).
  const localDate=new Date(`${detail.fecha}T${detail.hora}:00`);
  detail.tzOffsetMin=Number.isNaN(localDate.getTime())?new Date().getTimezoneOffset():localDate.getTimezoneOffset();
  const localId=createLocalId("bit"),createdLocalAt=new Date().toISOString();
  const queueItem={localId,module:"BIT",operation:"REGISTER_EVENT",payload:detail,syncStatus:"PENDIENTE",createdLocalAt,lastSyncAttempt:null,syncError:"",syncAttempts:0,serverId:"",serverFolio:""};
  await putQueueItem(queueItem);
  for(const file of selectedEvidence){
    if(file.size>10*1024*1024){showNotice(`La evidencia "${file.name}" excede 10 MB y no fue guardada.`);continue}
    await putEvidence({evidenceId:createLocalId("evi"),localId,file,name:file.name,type:file.type||"application/octet-stream",size:file.size,syncStatus:"PENDIENTE",syncAttempts:0,lastSyncAttempt:null,syncError:""});
  }
  lastSavedSnapshot={...detail};lockedLocalId=localId;setRegisterLocked(true);await refreshLocalStatus();
  document.dispatchEvent(new CustomEvent("nexus:bitacora-local-saved",{detail:{localId}}));
}
export function setBitacoraContext(context){bitContext=context||null}
export function getBitacoraSnapshot(){return bitState}
export async function getCachedBitacoraAccess(){if(!bitContext?.memberId||!bitContext?.eo?.codigoEO)return null;return getReference(cacheKey())}
export async function setBitacoraState(next={}){
  const hasServerState=Array.isArray(next.tipos);
  if(hasServerState&&bitContext?.memberId&&bitContext?.eo?.codigoEO)await putReference(cacheKey(),{tipos:next.tipos||[],facultades:next.facultades||{},evidencias:next.evidencias===true});
  let source=next;
  if(!hasServerState&&bitContext?.memberId&&bitContext?.eo?.codigoEO){
    const cached=await getReference(cacheKey());if(cached)source={...next,...cached};
  }
  bitState={tipos:Array.isArray(source.tipos)?source.tipos:[],eventos:Array.isArray(source.eventos)?source.eventos:[],seguimientoEventos:Array.isArray(source.seguimientoEventos)?source.seguimientoEventos:[],facultades:{registro:false,consulta:false,consultaAmpliada:false,seguimiento:false,...(source.facultades||{})},evidencias:source.evidencias===true,loadError:String(source.loadError||"")};
  fillTypes();renderColumnSelector();applyCapabilities();renderEvents();renderFollowup();await refreshLocalStatus();
}
export function openBitacora(){
  if(bitContext?.authenticated!==true)return;
  lockedLocalId="";clearRegisterForm();fillProgramacionFilters();setRegisterLocked(false);$("#bitRegistroResult").hidden=true;
  // v0.3.10 · Cada apertura empieza sin filtros heredados de un acceso directo anterior.
  resetConsultaFilters();resetFollowupFilters();
  const n=nowLocal();if(!$("#bitFecha").value)$("#bitFecha").value=n.fecha;if(!$("#bitHora").value)$("#bitHora").value=n.hora;
  $("#bitacoraModal").hidden=false;const first=bitState.facultades.registro===true?"registro":bitState.facultades.consulta===true?"consulta":"seguimiento";setTab(first);refreshLocalStatus();
}
// v0.3.2 · Abre Bitácora directamente en una pestaña con filtros preestablecidos
// o en la tarjeta de un evento. El usuario puede cambiar los filtros después.
function todayYmd(){const d=new Date(),pad=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function resetConsultaFilters(){const set=(id,v)=>{const el=$(id);if(el)el.value=v};set("#bitBuscar","");set("#bitFiltroDesde","");set("#bitFiltroHasta","");set("#bitFiltroTipo","");set("#bitFiltroResponsable","");set("#bitFiltroActividad","");set("#bitFiltroEstado","VIGENTE");set("#bitFiltroTip","");updateTipFilterIcon()}
function resetFollowupFilters(){const set=(id,v)=>{const el=$(id);if(el)el.value=v};set("#bitSeguimientoFuente","TODOS");set("#bitSeguimientoEstado","TODOS");set("#bitSeguimientoBuscar","")}
export function openBitacoraAt(opts={}){
  if(bitContext?.authenticated!==true)return false;
  const f=bitState.facultades||{};
  let tab=String(opts.tab||"");
  if(tab==="consulta"&&f.consulta!==true)tab="";
  if(tab==="seguimiento"&&f.seguimiento!==true)tab="";
  if(tab==="registro"&&f.registro!==true)tab="";
  openBitacora();
  if(tab==="consulta"){
    resetConsultaFilters();const c=opts.consulta||{};
    const day=c.hoy===true?todayYmd():"";
    if(c.desde||day)$("#bitFiltroDesde").value=c.desde||day;
    if(c.hasta||day)$("#bitFiltroHasta").value=c.hasta||day;
    if(c.tip&&$("#bitFiltroTip")){$("#bitFiltroTip").value=c.tip;updateTipFilterIcon()}
    if(c.estado&&$("#bitFiltroEstado"))$("#bitFiltroEstado").value=c.estado;
    setTab("consulta");renderEvents();
  }else if(tab==="seguimiento"){
    resetFollowupFilters();const g=opts.seguimiento||{};
    if(g.fuente&&$("#bitSeguimientoFuente"))$("#bitSeguimientoFuente").value=g.fuente;
    if(g.estado&&$("#bitSeguimientoEstado"))$("#bitSeguimientoEstado").value=g.estado;
    setTab("seguimiento");renderFollowup();
  }else if(tab==="registro")setTab("registro");
  if(opts.eventId){
    const id=String(opts.eventId);
    const inFollow=bitState.seguimientoEventos.some(x=>String(x.id||x._id||"")===id);
    const inEvents=bitState.eventos.some(x=>String(x.id||x._id||"")===id);
    let origin=opts.origin||(inFollow&&f.seguimiento===true?"seguimiento":"consulta");
    if(origin==="seguimiento"&&f.seguimiento!==true)origin="consulta";
    if(!inFollow&&!inEvents)return true;
    if(origin==="seguimiento")renderFollowup();else renderEvents();
    openDetail(id,origin);
  }
  return true;
}
export function hasBitacoraEvent(id){const k=String(id||"");return !!k&&[...bitState.eventos,...bitState.seguimientoEventos].some(x=>String(x.id||x._id||"")===k)}
export async function getPendingBitEvents(){return (await listQueueItems("BIT")).filter(x=>x.syncStatus!=="SINCRONIZADO")}
export async function getBitEvidence(localId){return listEvidence(localId)}
export async function updateBitQueue(item){await putQueueItem(item);if(lockedLocalId&&item?.localId===lockedLocalId&&item?.serverFolio)setRegisterLocked(true,String(item.serverFolio));await refreshLocalStatus()}
export async function updateBitEvidence(item){await putEvidence(item);await refreshLocalStatus()}
export async function removeBitEvidence(evidenceId){await deleteEvidence(evidenceId);await refreshLocalStatus()}
export async function notifyBitSynced(){await refreshLocalStatus()}
export function initBitacora(){
  const modal=$("#bitacoraModal");if(!modal)return;
  $("#btnCloseBitacora").addEventListener("click",()=>modal.hidden=true);modal.addEventListener("click",e=>{if(e.target===modal)modal.hidden=true});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)modal.hidden=true});
  $("#btnBitRegistro").addEventListener("click",()=>setTab("registro"));$("#btnBitConsulta").addEventListener("click",()=>{setTab("consulta");renderEvents()});$("#btnBitSeguimiento").addEventListener("click",()=>{setTab("seguimiento");renderFollowup()});$("#btnBitBack").addEventListener("click",()=>{const back=selectedDetailOrigin;selectedDetailEvent=null;setTab(back==="seguimiento"?"seguimiento":"consulta")});$("#btnBitTarjetaPdf")?.addEventListener("click",()=>exportCardPdf(selectedDetailEvent));
  $("#bitBuscar").addEventListener("input",renderEvents);["#bitFiltroTipo","#bitFiltroDesde","#bitFiltroHasta","#bitFiltroEstado","#bitFiltroTip"].forEach(id=>$(id)?.addEventListener("change",renderEvents));$("#bitSeguimientoEstado")?.addEventListener("change",renderFollowup);["#bitFiltroResponsable","#bitFiltroActividad"].forEach(id=>$(id)?.addEventListener("input",renderEvents));
  document.querySelector(".bit-legend-filter")?.addEventListener("click",e=>{const b=e.target.closest("[data-bit-class]");if(b)toggleLegendFilter(b.dataset.bitClass)});
  $("#bitTblMore")?.addEventListener("click",()=>{const w=$("#bitEventosList .bit-tbl-scroll");if(w)w.scrollBy({left:Math.max(160,w.clientWidth*.7),behavior:"smooth"})});
  window.addEventListener("resize",()=>updateMoreColumns());
  $("#bitEventosList")?.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr[data-bit-id]")){e.preventDefault();openDetail(e.target.dataset.bitId,"consulta")}});
  $("#btnBitFiltros")?.addEventListener("click",()=>{const p=$("#bitConsultaFiltros"),open=p.hidden;p.hidden=!open;$("#btnBitFiltros").setAttribute("aria-expanded",String(open));$("#btnBitFiltros").classList.toggle("is-selected",open)});
  $("#btnBitColumnas")?.addEventListener("click",()=>{const p=$("#bitConsultaColumnas"),open=p.hidden;p.hidden=!open;$("#btnBitColumnas").setAttribute("aria-expanded",String(open));$("#btnBitColumnas").classList.toggle("is-selected",open)});
  $("#btnBitLimpiarFiltros")?.addEventListener("click",()=>{$("#bitBuscar").value="";$("#bitFiltroDesde").value="";$("#bitFiltroHasta").value="";$("#bitFiltroTipo").value="";$("#bitFiltroResponsable").value="";$("#bitFiltroActividad").value="";$("#bitFiltroEstado").value="VIGENTE";$("#bitFiltroTip").value="";updateTipFilterIcon();renderEvents()});
  $("#bitColumnasOpciones")?.addEventListener("change",e=>{const input=e.target.closest("[data-bit-column]");if(!input)return;const id=String(input.dataset.bitColumn||"");if(input.checked){if(bitReportColumns.length>=6){input.checked=false;showNotice("Puedes mostrar hasta 6 columnas del evento.");return}if(!bitReportColumns.includes(id))bitReportColumns.push(id)}else{bitReportColumns=bitReportColumns.filter(x=>x!==id);if(!bitReportColumns.length){bitReportColumns=["descripcion"];renderColumnSelector()}}renderEvents()});
  $("#bitEventosList")?.addEventListener("click",e=>{const sort=e.target.closest("[data-bit-sort]");if(sort){const id=String(sort.dataset.bitSort||"");bitSort=id===bitSort.id?{id,dir:bitSort.dir==="ASC"?"DESC":"ASC"}:{id,dir:"ASC"};renderEvents();return}});
  {const t=$("#btnBitExportar"),m=$("#bitExportMenu");const set=o=>{if(!t||!m)return;m.hidden=!o;t.setAttribute("aria-expanded",String(o))};t?.addEventListener("click",e=>{e.stopPropagation();set(m.hidden)});m?.addEventListener("click",()=>set(false));document.addEventListener("click",e=>{if(m&&!m.hidden&&!m.contains(e.target)&&e.target!==t)set(false)})}
  $("#btnBitExcel")?.addEventListener("click",exportExcel);$("#btnBitPdf")?.addEventListener("click",()=>{$("#bitPdfOptions").hidden=false;$("#bitReporteAnotaciones")?.focus()});$("#btnBitPdfCancelar")?.addEventListener("click",()=>{$("#bitPdfOptions").hidden=true});$("#btnBitPdfDescargar")?.addEventListener("click",async()=>{await exportPdf();$("#bitPdfOptions").hidden=true});
  $("#bitEventosList").addEventListener("click",e=>{if(e.target.closest("[data-bit-reload]")){$("#bitEventosList").innerHTML='<div class="bitacora-empty">Cargando…</div>';document.dispatchEvent(new CustomEvent("nexus:bitacora-reload"));}});
  $("#bitEventosList").addEventListener("click",e=>{const row=e.target.closest("[data-bit-id]");if(row)openDetail(row.dataset.bitId,"consulta")});
  $("#bitSeguimientoList").addEventListener("click",e=>{const sb=e.target.closest("[data-bit-followup-sort]");if(sb){const id=String(sb.dataset.bitFollowupSort||"");bitFollowupSort=id===bitFollowupSort.id?{id,dir:bitFollowupSort.dir==="ASC"?"DESC":"ASC"}:{id,dir:"ASC"};renderFollowup();return}const row=e.target.closest("tr[data-bit-id]");if(row)openDetail(row.dataset.bitId,"seguimiento")});
  $("#bitSeguimientoList").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr[data-bit-id]")){e.preventDefault();openDetail(e.target.dataset.bitId,"seguimiento")}});
  $("#bitSegMore")?.addEventListener("click",()=>{const w=$("#bitSeguimientoList .bit-tbl-scroll");if(w)w.scrollBy({left:Math.max(160,w.clientWidth*.7),behavior:"smooth"})});
  window.addEventListener("resize",()=>updateSegMore());
  $("#bitSeguimientoHead")?.addEventListener("click",e=>{const b=e.target.closest("[data-bit-followup-sort]");if(!b)return;const id=String(b.dataset.bitFollowupSort||"");bitFollowupSort=id===bitFollowupSort.id?{id,dir:bitFollowupSort.dir==="ASC"?"DESC":"ASC"}:{id,dir:"ASC"};renderFollowup()});
  $("#bitSeguimientoFuente")?.addEventListener("change",renderFollowup);$("#bitSeguimientoBuscar")?.addEventListener("input",renderFollowup);
  $("#bitDetalleSeguimientoAcciones")?.addEventListener("click",e=>{const b=e.target.closest("[data-detail-followup]");if(b)openFollowupAction(String(b.dataset.detailFollowup||""))});
  $("#btnBitSeguimientoAccionCerrar")?.addEventListener("click",closeFollowupAction);$("#btnBitSeguimientoCancelar")?.addEventListener("click",closeFollowupAction);$("#btnBitSeguimientoConfirmar")?.addEventListener("click",submitFollowupAction);$("#bitSeguimientoAccionModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeFollowupAction()});
  $("#btnBitSeguimientoMensajeCerrar")?.addEventListener("click",()=>{$("#bitSeguimientoMensajeModal").hidden=true});$("#bitSeguimientoMensajeModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.hidden=true});
  document.addEventListener("nexus:bitacora-followup-result",e=>{showFollowupMessage(e.detail?.message||"Operación realizada.");const id=String(selectedDetailEvent?.id||selectedDetailEvent?._id||"");if(id){const fresh=bitState.seguimientoEventos.find(x=>String(x.id||x._id||"")===id);if(fresh){selectedDetailEvent=fresh;$("#bitDetalle").innerHTML=renderEventCard(fresh);renderFollowupDetailActions(fresh)}}});
  document.addEventListener("nexus:bitacora-followup-error",e=>showFollowupMessage(e.detail?.message||"No fue posible actualizar el seguimiento.","No se pudo completar"));
  $("#btnBitRelacionar")?.addEventListener("click",openProgramacionPicker);$("#btnBitRelacionCerrar")?.addEventListener("click",closeProgramacionPicker);$("#bitRelacionModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeProgramacionPicker()});$("#bitRelacionBuscar")?.addEventListener("input",renderProgramacionPicker);$("#bitRelacionFecha")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionTipo")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionTodas")?.addEventListener("change",renderProgramacionPicker);$("#bitRelacionLista")?.addEventListener("click",e=>{const row=e.target.closest("[data-programacion-id]");if(!row)return;selectedProgramacionId=String(row.dataset.programacionId||"");paintProgramacionSelection();closeProgramacionPicker()});$("#bitFecha")?.addEventListener("change",()=>{if(!selectedProgramacionId)return;const a=selectedActivity();if(a&&activityDate(a)!==String($("#bitFecha").value||"")){selectedProgramacionId="";paintProgramacionSelection()}});
  $("#bitEvidencias").addEventListener("change",e=>{selectedEvidence=[...selectedEvidence,...Array.from(e.target.files||[])].slice(0,10);e.target.value="";renderSelectedEvidence()});
  $("#bitEvidenceSelected").addEventListener("click",e=>{const b=e.target.closest("[data-remove-evidence]");if(!b)return;selectedEvidence.splice(Number(b.dataset.removeEvidence),1);renderSelectedEvidence()});
  $("#btnBitGuardar").addEventListener("click",()=>saveLocalEvent().catch(error=>showNotice(error?.message||"No fue posible guardar el registro en este dispositivo.")));
  $("#btnBitNuevo").addEventListener("click",()=>{lockedLocalId="";clearRegisterForm();setRegisterLocked(false);$("#bitRegistroResult").hidden=true;const n=nowLocal();$("#bitFecha").value=n.fecha;$("#bitHora").value=n.hora;});
  $("#bitSyncStatus").addEventListener("click",()=>{const p=$("#bitPendingPanel");p.hidden=!p.hidden;if(!p.hidden)renderPending()});
  $("#bitPendingPanel").addEventListener("click",e=>{const b=e.target.closest("[data-retry-local-id]");if(b)document.dispatchEvent(new CustomEvent("nexus:bitacora-retry",{detail:{localId:b.dataset.retryLocalId}}))});
  window.addEventListener("online",()=>{refreshLocalStatus();document.dispatchEvent(new CustomEvent("nexus:bitacora-sync-request"))});window.addEventListener("offline",refreshLocalStatus);
  setBitacoraState({});
}
