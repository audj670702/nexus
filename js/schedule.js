let context=null;
let view="calendar";
let type="TODAS";
let query="";
let cursor=new Date();

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=v=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const activities=()=>Array.isArray(context?.actividades)?context.actividades:[];
const startOf=a=>new Date(a?.inicio||a?.fechaInicio||a?.fecha||a?.start||"");
const endOf=a=>a?.fin||a?.fechaFin||a?.end?new Date(a.fin||a.fechaFin||a.end):null;
const titleOf=a=>String(a?.titulo||a?.nombre||a?.actividad||"Actividad");
const typeOf=a=>String(a?.tipoActividad||a?.tipo||a?.categoria||"Actividad").trim()||"Actividad";
const placeOf=a=>String(a?.ubicacion||a?.lugar||"");
const descOf=a=>String(a?.descripcion||a?.detalle||"");
const idOf=(a,i)=>String(a?.id||a?._id||i);
const allDay=a=>a?.todoElDia===true||a?.allDay===true;
const dayKey=d=>Number.isNaN(d?.getTime?.())?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const timeOf=a=>{if(allDay(a))return"Todo el día";const d=startOf(a);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})};
function colorFor(t){let h=0;for(const c of String(t))h=(h*31+c.charCodeAt(0))>>>0;return "hsl("+(h%360)+" 58% 42%)"}
function filtered(){
  const q=norm(query);
  return activities().filter(a=>(type==="TODAS"||typeOf(a)===type)&&(!q||norm([titleOf(a),typeOf(a),placeOf(a),descOf(a)].join(" ")).includes(q))).slice().sort((a,b)=>startOf(a)-startOf(b));
}
function renderTypes(){
  const types=[...new Set(activities().map(typeOf))].sort((a,b)=>a.localeCompare(b,"es"));
  $("scheduleTypes").innerHTML=["TODAS",...types].map(t=>`<button class="schedule-type ${type===t?"is-active":""}" type="button" data-type="${esc(t)}">${esc(t==="TODAS"?"Todos":t)}</button>`).join("");
  $("scheduleTypes").querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{type=b.dataset.type;render()});
}
function renderCalendar(){
  const list=filtered(),y=cursor.getFullYear(),m=cursor.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7,by=new Map();
  list.forEach(a=>{const k=dayKey(startOf(a));if(!k)return;if(!by.has(k))by.set(k,[]);by.get(k).push(a)});
  const cells=Array.from({length:offset},()=>'<div class="schedule-day is-empty"></div>');
  for(let d=1;d<=days;d++){const k=dayKey(new Date(y,m,d)),items=by.get(k)||[],today=k===dayKey(new Date());cells.push(`<div class="schedule-day ${today?"is-today":""}"><span class="schedule-number">${d}</span><div class="schedule-events">${items.map(a=>`<button class="schedule-event" style="--event-color:${colorFor(typeOf(a))}" data-id="${esc(idOf(a,activities().indexOf(a)))}" type="button"><small>${esc(timeOf(a))} · ${esc(typeOf(a))}</small><strong>${esc(titleOf(a))}</strong></button>`).join("")}</div></div>`)}
  $("scheduleBody").innerHTML=`<div class="schedule-month-nav"><button id="schedulePrev" type="button">‹</button><strong>${esc(first.toLocaleDateString("es-MX",{month:"long",year:"numeric"}))}</strong><button id="scheduleNext" type="button">›</button></div><div class="schedule-weekdays"><span>LUN</span><span>MAR</span><span>MIÉ</span><span>JUE</span><span>VIE</span><span>SÁB</span><span>DOM</span></div><div class="schedule-grid">${cells.join("")}</div>`;
  $("schedulePrev").onclick=()=>{cursor=new Date(y,m-1,1);renderCalendar()};$("scheduleNext").onclick=()=>{cursor=new Date(y,m+1,1);renderCalendar()};bindItems();
}
function renderList(){
  const list=filtered();if(!list.length){$("scheduleBody").innerHTML='<div class="schedule-empty">No hay actividades para este criterio.</div>';return}
  let last="";$("scheduleBody").innerHTML='<div class="schedule-list">'+list.map(a=>{const d=startOf(a),k=dayKey(d),head=k!==last?(last=k,`<div class="schedule-list-day">${esc(d.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"}))}</div>`):"";return head+`<button class="schedule-list-item" data-id="${esc(idOf(a,activities().indexOf(a)))}" type="button"><span class="schedule-list-time">${esc(timeOf(a))}</span><span class="schedule-list-mark" style="--event-color:${colorFor(typeOf(a))}"></span><span class="schedule-list-copy"><strong>${esc(titleOf(a))}</strong><span>${esc(typeOf(a)+(placeOf(a)?" · "+placeOf(a):""))}</span></span><span>›</span></button>`}).join("")+"</div>";bindItems();
}
function bindItems(){$("scheduleBody").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>openDetail(activities().find((a,i)=>idOf(a,i)===b.dataset.id)))}
function openDetail(a){if(!a)return;const s=startOf(a),e=endOf(a);$("scheduleBody").innerHTML=`<button id="scheduleBack" class="schedule-back" type="button">‹ Volver</button><div class="schedule-detail"><div class="schedule-detail-row"><span>Actividad</span><strong>${esc(titleOf(a))}</strong></div><div class="schedule-detail-row"><span>Tipo</span><strong>${esc(typeOf(a))}</strong></div><div class="schedule-detail-row"><span>Inicio</span><strong>${esc(Number.isNaN(s.getTime())?"—":s.toLocaleString("es-MX"))}</strong></div>${e&&!Number.isNaN(e.getTime())?`<div class="schedule-detail-row"><span>Término</span><strong>${esc(e.toLocaleString("es-MX"))}</strong></div>`:""}${placeOf(a)?`<div class="schedule-detail-row"><span>Lugar</span><strong>${esc(placeOf(a))}</strong></div>`:""}${descOf(a)?`<div class="schedule-detail-row"><span>Detalle</span><strong>${esc(descOf(a))}</strong></div>`:""}${a.enlace?`<div class="schedule-detail-row"><span>Enlace</span><strong><a href="${esc(a.enlace)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a></strong></div>`:""}</div>`; $("scheduleBack").onclick=render}
function render(){renderTypes();$("btnScheduleCalendar").classList.toggle("is-active",view==="calendar");$("btnScheduleList").classList.toggle("is-active",view==="list");view==="calendar"?renderCalendar():renderList()}
export function setScheduleContext(next){context=next||null}
export function openSchedule(){const now=new Date();cursor=new Date(now.getFullYear(),now.getMonth(),1);view="calendar";type="TODAS";query="";$("scheduleSearch").value="";$("scheduleModal").hidden=false;document.body.style.overflow="hidden";render()}
export function initSchedule(){const modal=$("scheduleModal");if(!modal)return;$("btnCloseSchedule").onclick=()=>{modal.hidden=true;document.body.style.overflow=""};modal.addEventListener("click",e=>{if(e.target===modal)$("btnCloseSchedule").click()});$("btnScheduleCalendar").onclick=()=>{view="calendar";render()};$("btnScheduleList").onclick=()=>{view="list";render()};$("scheduleSearch").addEventListener("input",e=>{query=e.target.value;render()});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)$("btnCloseSchedule").click()})}
