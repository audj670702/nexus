// NEXUS · Modos de vista · v0.3.2
// Regla rol → modo (definida con Jorge, 1 oct 2026):
//   CLIENTE    → sólo Modo Cliente
//   EJECUTIVO  → sólo Modo Ejecutivo
//   Operativo  → sólo Modo Operación (USU, A, B, C…)
//   ADM        → todos; entra a Ejecutivo la primera vez y después al último que usó.
// Administración no es una tarjeta: vive en el menú de la cuenta, sólo para ADM.

export const MODES = Object.freeze({
  OPERACION: { id: "OPERACION", label: "Operación", band: "MODO OPERACIÓN", tone: "op" },
  EJECUTIVO: { id: "EJECUTIVO", label: "Ejecutivo", band: "MODO EJECUTIVO", tone: "eje" },
  CLIENTE: { id: "CLIENTE", label: "Cliente", band: "MODO CLIENTE", tone: "cte" }
});

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let api = {};
let currentMode = null;
let lastContext = null;

function rolesOf(c) {
  return (Array.isArray(c?.roles) ? c.roles : []).map(r => String(r || "").trim().toUpperCase());
}

export function availableModes(c) {
  if (c?.authenticated !== true) return [];
  const roles = rolesOf(c);
  if (roles.includes("ADM")) return ["EJECUTIVO", "OPERACION", "CLIENTE"];
  if (roles.includes("CLIENTE")) return ["CLIENTE"];
  if (roles.includes("EJECUTIVO")) return ["EJECUTIVO"];
  return ["OPERACION"];
}

function storageKey(c) { return `nexus.mode.${String(c?.memberId || "anon")}`; }
function readStoredMode(c) { try { return localStorage.getItem(storageKey(c)) || ""; } catch (_) { return ""; } }
function storeMode(c, mode) { try { localStorage.setItem(storageKey(c), mode); } catch (_) {} }

function resolveMode(c) {
  const modes = availableModes(c);
  if (!modes.length) return null;
  const stored = readStoredMode(c);
  return modes.includes(stored) ? stored : modes[0];
}

export function getCurrentMode() { return currentMode; }

// ---------- utilidades de datos ----------
function dayBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { start, end: start + 86400000 };
}
function ts(v) { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; }
function isToday(v) { const t = ts(v); if (t === null) return false; const { start, end } = dayBounds(); return t >= start && t < end; }
function hhmm(v) { const t = ts(v); return t === null ? "—" : new Date(t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function myUsrId(c) { const u = c?.user || {}; return String(u.usrId || u._id || u.id || "").trim(); }
function evDate(e) { return e?.fechaHoraEvento || e?.fechaEvento || e?.fecha || ""; }
function isTip(e) { return e?.esTip === true || e?.tip === true || String(e?.clasificacion || e?.tipoRegistro || "").toUpperCase() === "TIP"; }
function followState(e) { return String(e?.seguimientoEstado || "SIN_ASIGNAR").toUpperCase(); }
function actStart(a) { return a?.inicio || a?.fechaInicio || a?.fecha || a?.start || ""; }
function actEnd(a) { return a?.fin || a?.fechaFin || a?.end || actStart(a); }
function actTitle(a) { return String(a?.titulo || a?.nombre || a?.title || a?.actividad || "Actividad"); }
function actType(a) { return String(a?.tipoActividad || a?.tipoEtiqueta || a?.tipo?.etiqueta || (typeof a?.tipo === "string" ? a.tipo : "") || ""); }

function todayActivities(c) {
  const { start, end } = dayBounds();
  return (Array.isArray(c?.actividades) ? c.actividades : [])
    .filter(a => { const s = ts(actStart(a)), f = ts(actEnd(a)); if (s === null) return false; return s < end && (f ?? s) >= start; })
    .sort((a, b) => (ts(actStart(a)) || 0) - (ts(actStart(b)) || 0));
}

const ICON = {
  bit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  cte: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v10H8l-4 4z"/></svg>'
};

// ---------- piezas de interfaz ----------
const CHEV = '<svg class="mv-chev-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function stat(val, label, mv, tone) {
  return `<button type="button" class="mv-stat ${tone ? `mv-tone-${tone}` : ""}" data-mv="${mv}"><strong>${val}</strong><span>${label}</span>${CHEV}</button>`;
}
function kpi(val, label, mv, tone, enabled = true) {
  return `<button type="button" class="mv-kpi mv-tone-${tone || "base"}" data-mv="${mv}" ${enabled ? "" : "disabled"}><span class="mv-kpi-top"><strong>${val}</strong>${CHEV}</span><span class="mv-kpi-label">${label}</span></button>`;
}
function isCte(e) { return String(e?.fuente || "").toUpperCase() === "CTE"; }
function idOf(e) { return String(e?.id || e?._id || ""); }

// ---------- vistas ----------
async function viewOperacion(c) {
  const bit = api.getBit?.() || {};
  const f = bit.facultades || {};
  const hasBit = c?.bitacora?.activo === true || f.registro === true || f.consulta === true || f.seguimiento === true;
  const me = myUsrId(c);
  let html = "";
  if (hasBit) {
    const pending = await (api.getPendingBitCount ? api.getPendingBitCount().catch(() => 0) : 0) || 0;
    const assigned = (bit.seguimientoEventos || []).filter(e => String(e?.asignacionActual?.asignadoUsrId || "") === me && followState(e) === "EN_SEGUIMIENTO").length;
    const tipsToday = (bit.eventos || []).filter(e => isTip(e) && isToday(evDate(e))).length;
    const stats = [];
    if (f.seguimiento === true) stats.push(stat(assigned, "Seguimientos asignados a mí", "bit-seg-mine", assigned ? "amber" : ""));
    if (f.consulta === true || f.consultaAmpliada === true) stats.push(stat(tipsToday, "Tarjetas Informativas Prioritarias hoy", "bit-tip-today", tipsToday ? "red" : ""));
    html += `<section class="mv-card" aria-labelledby="mvBitTitle">
      <div class="mv-card-head"><div class="mv-card-title">${ICON.bit}<h2 id="mvBitTitle">Bitácora</h2></div>
      <span class="mv-pill ${pending ? "mv-pill-warn" : ""}">${pending ? `${pending} por sincronizar` : "Sincronizada"}</span></div>
      ${f.registro === true ? `<button type="button" class="mv-primary" data-mv="bit-register">${ICON.plus}Registrar evento</button>` : `<button type="button" class="mv-secondary" data-mv="bit-open">Abrir Bitácora</button>`}
      ${stats.length ? `<div class="mv-stats">${stats.join("")}</div>` : ""}
    </section>`;
  }
  const acts = todayActivities(c);
  html += `<section class="mv-block" aria-labelledby="mvActTitle">
    <div class="mv-block-head"><h2 id="mvActTitle">Actividades de hoy</h2><button type="button" class="mv-link" data-mv="schedule">Ver programación</button></div>
    <div class="mv-list">${acts.length ? acts.slice(0, 5).map(a => `<button type="button" class="mv-row" data-mv="schedule"><span class="mv-time">${esc(hhmm(actStart(a)))}</span><span class="mv-row-copy"><strong>${esc(actTitle(a))}</strong>${actType(a) ? `<span>${esc(actType(a))}</span>` : ""}</span></button>`).join("") : `<p class="mv-empty">Sin actividades programadas para hoy.</p>`}</div>
  </section>`;
  return html;
}

function viewEjecutivo(c) {
  const bit = api.getBit?.() || {};
  const cte = api.getCte?.() || {};
  const f = bit.facultades || {};
  const hasBit = c?.bitacora?.activo === true || !!(Object.values(f).some(v => v === true));
  const roles = rolesOf(c);
  const eventos = bit.eventos || [], segs = bit.seguimientoEventos || [];
  // Tickets de clientes: los de Atención al Cliente más los que llegan a Seguimiento con origen CTE.
  const ticketMap = new Map();
  [...(cte.tickets || []), ...segs.filter(isCte)].forEach(e => { const k = idOf(e); if (k && !ticketMap.has(k)) ticketMap.set(k, e); });
  const tickets = [...ticketMap.values()];
  const hasCte = roles.includes("ADM") || roles.includes("CLIENTE") || f.seguimiento === true || tickets.length > 0;
  const today = eventos.filter(e => isToday(evDate(e)));
  const tips = today.filter(isTip);
  const open = segs.filter(e => followState(e) !== "ATENDIDO");
  const unassigned = segs.filter(e => followState(e) === "SIN_ASIGNAR" && !isCte(e));
  const openTickets = tickets.filter(e => followState(e) !== "ATENDIDO")
    .sort((x, y) => (ts(evDate(y)) || 0) - (ts(evDate(x)) || 0));
  const n = (ok, v) => ok ? String(v) : "—";
  const clsCte = e => ({ QUEJA: "Queja", INFORMACION: "Información", SUGERENCIA: "Sugerencia", SOLICITUD: "Solicitud" })[String(e?.clasificacionCte || "").toUpperCase()] || "Atención";
  const attention = [
    ...openTickets.slice(0, 3).map(e => ({ dot: "red", t: `Ticket de cliente · ${clsCte(e)}`, s: [e?.folio, e?.lugar, e?.registranteNombre].filter(Boolean).join(" · "), mv: "ticket", id: idOf(e), tag: followState(e) === "SIN_ASIGNAR" ? "Sin atender" : "En atención" })),
    ...tips.slice(0, 3).map(e => ({ dot: "red", t: `Tarjeta Informativa Prioritaria · ${e?.tipoEtiqueta || "Evento"}`, s: `${hhmm(evDate(e))} · ${e?.registranteNombre || ""}`, mv: "bit-tip-event", id: idOf(e) })),
    ...unassigned.slice(0, 3).map(e => ({ dot: "amber", t: "Seguimiento sin responsable", s: [e?.folio, e?.tipoEtiqueta].filter(Boolean).join(" · "), mv: "bit-seg-event", id: idOf(e) }))
  ];
  const reportsLink = api.canReports?.(c) ? `<button type="button" class="mv-link" data-mv="reports">Informes ›</button>` : "";
  return `<section class="mv-intro"><h1>Hoy en la operación</h1><div class="mv-intro-row"><span>Resumen al momento</span>${reportsLink}</div></section>
  <section class="mv-kpis" aria-label="Indicadores del día">
    ${kpi(n(hasCte, openTickets.length), "Tickets de clientes abiertos", "tickets-open", "red", hasCte)}
    ${kpi(n(hasBit, tips.length), "Tarjetas Informativas Prioritarias hoy", "bit-tip-today", "red", hasBit)}
    ${kpi(n(hasBit, open.length), "Seguimientos abiertos", "bit-seg-open", "amber", hasBit && f.seguimiento === true)}
    ${kpi(n(hasBit, today.length), "Eventos registrados hoy", "bit-today", "base", hasBit)}
  </section>
  <section class="mv-block" aria-labelledby="mvAttTitle"><div class="mv-block-head"><h2 id="mvAttTitle">Requieren atención</h2></div>
    <div class="mv-list">${attention.length ? attention.map(a => `<button type="button" class="mv-row" data-mv="${a.mv}" data-id="${esc(a.id)}"><span class="mv-dot mv-dot-${a.dot}" aria-hidden="true"></span><span class="mv-row-copy"><strong>${esc(a.t)}</strong><span>${esc(a.s)}</span></span>${a.tag ? `<span class="mv-badge mv-badge-red">${esc(a.tag)}</span>` : ""}<span class="mv-chev" aria-hidden="true">›</span></button>`).join("") : `<p class="mv-empty">${hasBit ? "Nada pendiente por ahora." : "Sin acceso a Bitácora para este usuario."}</p>`}</div>
  </section>`;
}

function viewCliente() {
  const cte = api.getCte?.() || {};
  const tickets = (cte.tickets || []).slice(0, 5);
  const cls = e => ({ QUEJA: "Queja", INFORMACION: "Información", SUGERENCIA: "Sugerencia", SOLICITUD: "Solicitud" })[String(e?.clasificacionCte || "").toUpperCase()] || "Atención";
  const st = e => { const s = followState(e); return s === "ATENDIDO" ? ["Atendido", "ok"] : s === "EN_SEGUIMIENTO" ? ["En seguimiento", "warn"] : ["Recibido", "info"]; };
  return `<section class="mv-intro"><h1>Atención al Cliente</h1><div class="mv-intro-row"><span>Reporta y da seguimiento a tus solicitudes</span></div></section>
  <button type="button" class="mv-primary" data-mv="cte-new">${ICON.plus}Nuevo reporte</button>
  <section class="mv-block" aria-labelledby="mvTkTitle"><div class="mv-block-head"><h2 id="mvTkTitle">Mis reportes</h2>${tickets.length ? `<button type="button" class="mv-link" data-mv="cte-tickets">Ver todos</button>` : ""}</div>
    <div class="mv-list">${tickets.length ? tickets.map(e => { const [label, tone] = st(e); return `<button type="button" class="mv-row" data-mv="cte-tickets"><span class="mv-row-copy"><strong>${esc(cls(e))} · ${esc(e?.lugar || "")}</strong><span>${esc(e?.folio || "")} · ${esc(e?.fechaHoraEvento ? new Date(e.fechaHoraEvento).toLocaleDateString("es-MX") : "")}</span></span><span class="mv-badge mv-badge-${tone}">${label}</span></button>`; }).join("") : `<p class="mv-empty">Aún no tienes reportes.</p>`}</div>
  </section>`;
}

function viewVisitante() {
  return `<section class="mv-card mv-welcome"><h1>Bienvenido a NEXUS</h1><p>Inicia sesión para ver tu día de trabajo.</p><button type="button" class="mv-primary" data-mv="login">Iniciar sesión</button></section>`;
}

// ---------- indicador de modo y menú ----------
function paintModeLabel() {
  const el = $("#modeLabel"); if (!el) return;
  if (!currentMode) { el.hidden = true; return; }
  const m = MODES[currentMode];
  el.hidden = false;
  el.dataset.tone = m.tone;
  el.textContent = m.band;
  document.body.dataset.mode = currentMode;
}

function paintMenuModes(c) {
  const box = $("#menuModes"); if (!box) return;
  const modes = availableModes(c);
  if (modes.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<span class="account-menu-section">MODO</span>` + modes.map(id => {
    const m = MODES[id];
    return `<button type="button" class="menu-mode menu-mode-${m.tone} ${id === currentMode ? "is-current" : ""}" data-action="mode:${id}"><span class="menu-mode-dot" aria-hidden="true"></span><span>${m.label}</span>${id === currentMode ? '<span aria-hidden="true">✓</span>' : ""}</button>`;
  }).join("");
}

// ---------- barra de navegación flotante ----------
const NAV_ICON = {
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
  mns: '<path d="M4 6h16v10H8l-4 4z"/>',
  docs: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  schedule: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  training: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
  bitacora: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'
};
const NAV_LABEL = { home: "Inicio", mns: "Mensajería", docs: "Documentos", schedule: "Programación", training: "Cursos", bitacora: "Bitácora" };
// Ventana abierta → sección activa en la barra
const NAV_MODAL = { docs: "#documentsModal", schedule: "#scheduleModal", bitacora: "#bitacoraModal", mns: "#nexusMnsOverlay" };

function navItems(c) {
  if (currentMode === "OPERACION") return ["home", "mns", "docs", "schedule", "training"];
  if (currentMode === "EJECUTIVO") {
    const bit = api.getBit?.() || {};
    const hasBit = c?.bitacora?.activo === true || !!(bit.facultades && Object.values(bit.facultades).some(v => v === true));
    return ["home", ...(hasBit ? ["bitacora"] : []), "mns", "docs", "schedule"];
  }
  return []; // Cliente y visitante: sin barra
}

function activeNav() {
  for (const [id, sel] of Object.entries(NAV_MODAL)) {
    const el = document.querySelector(sel);
    if (el && el.isConnected && !el.hidden) return id;
  }
  return "home";
}

function paintNavActive() {
  const nav = $("#bottomNav"); if (!nav || nav.hidden) return;
  const active = activeNav();
  nav.querySelectorAll("[data-nav]").forEach(b => {
    const on = b.dataset.nav === active;
    b.classList.toggle("is-active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}

function renderNav(c) {
  const nav = $("#bottomNav"); if (!nav) return;
  const items = c?.authenticated === true ? navItems(c) : [];
  nav.hidden = items.length === 0;
  document.body.dataset.nav = items.length ? "on" : "off";
  nav.style.setProperty("--nav-count", String(items.length || 1));
  nav.innerHTML = items.map(id => `<button type="button" class="bottom-nav-item" data-nav="${id}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICON[id]}</svg><span>${NAV_LABEL[id]}</span></button>`).join("");
  paintNavActive();
}

function goNav(id) {
  const hadOpen = activeNav() !== "home";
  if (id === activeNav() && id !== "home") return;
  api.closeAllModals?.();
  if (id === "home") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  // Se espera a que el historial termine de cerrar la ventana anterior.
  setTimeout(() => openNav(id), hadOpen ? 180 : 0);
}

function openNav(id) {
  if (id === "mns") api.openMns?.();
  else if (id === "docs") api.openDocuments?.();
  else if (id === "schedule") api.openSchedule?.();
  else if (id === "training") api.openTraining?.();
  else if (id === "bitacora") api.openBitacora?.();
}

// ---------- opciones del monitor ----------
function initTvOptions() {
  const trigger = $("#btnTvOptions"), panel = $("#tvOptions");
  if (!trigger || !panel) return;
  const setOpen = open => { panel.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); };
  trigger.addEventListener("click", e => { e.stopPropagation(); setOpen(panel.hidden); });
  $("#btnTvOptionsClose")?.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", e => { if (e.target.closest("[data-channel]")) setTimeout(() => setOpen(false), 150); });
  document.addEventListener("click", e => { if (!panel.hidden && !panel.contains(e.target) && !trigger.contains(e.target)) setOpen(false); });
}

// Tickets: quien da seguimiento los ve en Bitácora › Seguimiento (origen CTE);
// si no tiene esa facultad, se abren en Atención al Cliente.
function openTickets(id = "") {
  const f = (api.getBit?.() || {}).facultades || {};
  const viaBit = f.seguimiento === true && (!id || api.hasBitacoraEvent?.(id));
  if (viaBit) api.openBitacoraAt?.({ tab: "seguimiento", seguimiento: { fuente: "CTE", estado: "ABIERTOS" }, eventId: id || undefined, origin: "seguimiento" });
  else if (id) api.openCteTicket?.(id);
  else api.openCteTickets?.();
}

export async function renderModeView(c) {
  lastContext = c;
  const view = $("#modeView"); if (!view) return;
  if (!currentMode) currentMode = resolveMode(c);
  paintModeLabel(); paintMenuModes(c);
  let html = viewVisitante();
  if (currentMode === "OPERACION") html = await viewOperacion(c);
  else if (currentMode === "EJECUTIVO") html = viewEjecutivo(c);
  else if (currentMode === "CLIENTE") html = viewCliente(c);
  view.innerHTML = html;
  renderNav(c);
}

export function setMode(mode) {
  if (!lastContext || !availableModes(lastContext).includes(mode)) return;
  currentMode = mode;
  storeMode(lastContext, mode);
  renderModeView(lastContext);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function initModes(handlers = {}) {
  api = handlers;
  initTvOptions();
  $("#modeView")?.addEventListener("click", e => {
    const el = e.target.closest("[data-mv]"); if (!el || el.disabled) return;
    const a = el.dataset.mv, id = el.dataset.id || "";
    if (a === "bit-register") api.openBitacora?.("registro");
    else if (a === "bit-open") api.openBitacora?.();
    else if (a === "bit-today") api.openBitacoraAt?.({ tab: "consulta", consulta: { hoy: true } });
    else if (a === "bit-tip-today") api.openBitacoraAt?.({ tab: "consulta", consulta: { hoy: true, tip: "TIP" } });
    else if (a === "bit-seg-open") api.openBitacoraAt?.({ tab: "seguimiento", seguimiento: { estado: "ABIERTOS" } });
    else if (a === "bit-seg-mine") api.openBitacoraAt?.({ tab: "seguimiento", seguimiento: { estado: "MIOS" } });
    else if (a === "tickets-open") openTickets();
    else if (a === "bit-tip-event") api.openBitacoraAt?.({ tab: "consulta", consulta: { hoy: true, tip: "TIP" }, eventId: id, origin: "consulta" });
    else if (a === "bit-seg-event") api.openBitacoraAt?.({ tab: "seguimiento", seguimiento: { estado: "SIN_ASIGNAR" }, eventId: id, origin: "seguimiento" });
    else if (a === "ticket") openTickets(id);
    else if (a === "schedule") api.openSchedule?.();
    else if (a === "reports") api.openReports?.();
    else if (a === "cte-new") api.openCte?.();
    else if (a === "cte-tickets") api.openCteTickets?.();
    else if (a === "login") document.querySelector("#btnLogin")?.click();
  });
  $("#bottomNav")?.addEventListener("click", e => {
    const id = e.target.closest("[data-nav]")?.dataset.nav; if (id) goNav(id);
  });
  new MutationObserver(paintNavActive).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("nexus:navigation", e => {
    const action = String(e.detail?.action || "");
    if (action.startsWith("mode:")) setMode(action.slice(5));
  });
  document.addEventListener("nexus:data-changed", () => { if (lastContext) renderModeView(lastContext); });
}
