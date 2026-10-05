// NEXUS · Botón Atrás del teléfono · v0.2.93
// Cada ventana (modal) que se abre agrega un paso al historial del navegador.
// Así, el botón Atrás cierra la ventana superior en lugar de salir de la app.
// Si la ventana se cierra con su propio botón, se consume ese paso del historial.

const MODAL_SELECTOR = [
  ".modal-backdrop",
  "#iosTutorialModal",
  "#bitRelacionModal",
  "#bitSeguimientoAccionModal",
  "#bitSeguimientoMensajeModal",
  "#nexusMnsOverlay",
  "#tvOptions",
  "#tvFsLayer"
].join(",");

const CLOSE_SELECTOR = [
  ".modal-close",
  "#btnNexusNoticeAccept",
  "#btnBitRelacionCerrar",
  "#btnBitSeguimientoAccionCerrar",
  "#btnBitSeguimientoMensajeCerrar",
  "#iosTutorialClose",
  "[id^='btnClose']",
  "#btnTvOptionsClose"
].join(",");

const stack = [];            // ventanas abiertas, la última es la superior
let ignorePops = 0;          // pasos del historial que nosotros mismos retiramos

function isOpen(el) {
  return !!el && el.isConnected && !el.hidden;
}

function closeModal(el) {
  if (el.id === "nexusMnsOverlay") {
    el.remove();
    document.body.classList.remove("nexus-mns-open");
    return;
  }
  // Se usa el botón propio para que corra su limpieza (video, scroll, avisos).
  const own = [...el.querySelectorAll(CLOSE_SELECTOR)].find(b => b.closest(MODAL_SELECTOR) === el);
  if (own) own.click();
  if (isOpen(el)) el.hidden = true;
  document.body.style.overflow = "";
}

function onOpened(el) {
  if (stack.includes(el)) return;
  stack.push(el);
  history.pushState({ nexusModal: el.id || true }, "");
}

function onClosed(el) {
  const i = stack.indexOf(el);
  if (i === -1) return;
  stack.splice(i, 1);
  // Cerrada con su propio botón: retirar el paso que agregamos al abrirla.
  if (history.state && history.state.nexusModal) {
    ignorePops++;
    history.back();
  }
}

function scan() {
  document.querySelectorAll(MODAL_SELECTOR).forEach(el => {
    if (isOpen(el)) onOpened(el);
  });
  [...stack].forEach(el => { if (!isOpen(el)) onClosed(el); });
}

// Cierra todas las ventanas abiertas (la barra de navegación lo usa al cambiar de sección).
export function closeAllModals() {
  [...stack].reverse().forEach(el => { if (isOpen(el)) closeModal(el); });
}

export function initBackNavigation() {
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = stack.pop();
    if (top) closeModal(top);
  });
  new MutationObserver(scan).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden"]
  });
}
