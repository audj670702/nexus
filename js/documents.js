const DOCS_SEEN_PREFIX="nexus.docs.seen.v1";

function text(v){return String(v??"").trim()}
function docUrl(d={}){return text(d.documentoUrl||d.url||d.enlace||d.fileUrl||d.archivo?.url||d.documento?.url)}
function docId(d={}){return text(d.id||d._id||d.documentoId||docUrl(d)||d.titulo||d.nombreArchivo)}
function docTitle(d={}){return text(d.titulo||d.nombre||d.nombreArchivo||"Documento")}
function docMeta(d={}){return text(d.categoria||d.tipo||d.nombreArchivo||d.descripcion||"Documento")}
function extLabel(d={}){const raw=(docUrl(d).split("?")[0].split(".").pop()||"DOC").toUpperCase();return raw.length<=5?raw:"DOC"}
function storageKey(context={}){const member=text(context.memberId||context.user?.memberId||"USR"),eo=text(context.eo?.codigoEO||context.eo?._id||"EO");return `${DOCS_SEEN_PREFIX}:${member}:${eo}`}
function seenSet(context){try{return new Set(JSON.parse(localStorage.getItem(storageKey(context))||"[]"))}catch{return new Set()}}
function saveSeen(context,set){try{localStorage.setItem(storageKey(context),JSON.stringify([...set]))}catch(_){}}
function currentDocs(context){return Array.isArray(context?.documentos)?context.documentos.filter(d=>docUrl(d)):[]}

let ctx=null;
let query="";

function renderBadge(){
  const card=document.querySelector('[data-module="docs"]');
  if(!card)return;
  let badge=card.querySelector(".module-new-count");
  const seen=seenSet(ctx);
  const count=currentDocs(ctx).filter(d=>{const id=docId(d);return id&&!seen.has(id)}).length;
  if(!badge){badge=document.createElement("span");badge.className="module-new-count";card.append(badge)}
  badge.hidden=!count;
  badge.textContent=count>99?"99+":String(count);
  badge.setAttribute("aria-label",`${count} documentos nuevos`);
}
function renderList(){
  const list=document.querySelector("#documentsList"),count=document.querySelector("#documentsCount");
  if(!list||!count)return;
  const all=currentDocs(ctx);
  const q=query.toLocaleLowerCase("es-MX");
  const filtered=!q?all:all.filter(d=>[docTitle(d),docMeta(d),text(d.descripcion)].join(" ").toLocaleLowerCase("es-MX").includes(q));
  count.textContent=`${filtered.length} ${filtered.length===1?"documento":"documentos"}`;
  list.replaceChildren();
  if(!filtered.length){
    const empty=document.createElement("div");empty.className="documents-empty";empty.textContent=q?"No hay documentos que coincidan con la búsqueda.":"No hay documentos disponibles.";
    list.append(empty);return;
  }
  for(const d of filtered){
    const b=document.createElement("button");b.type="button";b.className="document-row";
    const type=document.createElement("span");type.className="document-type";type.textContent=extLabel(d);
    const copy=document.createElement("span");copy.className="document-copy";
    const title=document.createElement("strong");title.textContent=docTitle(d);
    const meta=document.createElement("span");meta.textContent=docMeta(d);
    const arrow=document.createElement("span");arrow.className="document-arrow";arrow.textContent="›";
    copy.append(title,meta);b.append(type,copy,arrow);b.addEventListener("click",()=>viewDocument(d));list.append(b);
  }
}
function viewDocument(d){
  const url=docUrl(d);if(!url)return;
  const seen=seenSet(ctx),id=docId(d);if(id){seen.add(id);saveSeen(ctx,seen);renderBadge()}
  document.querySelector("#documentsList").hidden=true;
  document.querySelector("#documentsCount").hidden=true;
  document.querySelector("#documentsToolbar")?.setAttribute("hidden","");
  const viewer=document.querySelector("#documentViewer");
  document.querySelector("#documentViewerTitle").textContent=docTitle(d);
  const external=document.querySelector("#documentOpenExternal");external.href=url;
  const frame=document.querySelector("#documentFrame");frame.src=url;
  viewer.hidden=false;
}
function showList(){
  const frame=document.querySelector("#documentFrame");frame.removeAttribute("src");
  document.querySelector("#documentViewer").hidden=true;
  document.querySelector("#documentsList").hidden=false;
  document.querySelector("#documentsCount").hidden=false;
  document.querySelector(".documents-toolbar").hidden=false;
  renderList();
}
function close(){
  const modal=document.querySelector("#documentsModal");if(!modal)return;
  document.querySelector("#documentFrame")?.removeAttribute("src");
  modal.hidden=true;document.body.style.overflow="";
}
export function openDocuments(){
  const modal=document.querySelector("#documentsModal");if(!modal||!ctx?.authenticated)return;
  query="";const input=document.querySelector("#documentsSearch");if(input)input.value="";
  showList();modal.hidden=false;document.body.style.overflow="hidden";
  requestAnimationFrame(()=>input?.focus());
}
export function setDocumentsContext(context){ctx=context||null;renderBadge()}
export function initDocuments(){
  const modal=document.querySelector("#documentsModal");if(!modal)return;
  document.querySelector("#btnCloseDocuments")?.addEventListener("click",close);
  document.querySelector("#btnBackDocuments")?.addEventListener("click",showList);
  document.querySelector("#documentsSearch")?.addEventListener("input",e=>{query=String(e.target.value||"").trim();renderList()});
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close()});
}
