export const BASIC_MODULES=Object.freeze([
{id:"mns",name:"Mensajería",description:"Comunicación MNS",capability:"mns"},
{id:"training",name:"Mis Cursos",description:"Cursos vigentes y completados"},
{id:"docs",name:"Documentos",description:"Documentos disponibles"},
{id:"schedule",name:"Programación",description:"Actividades y agenda"},
{id:"bitacora",name:"Bitácora",description:"Eventos y seguimiento",capability:"bitacora"},
{id:"reports",name:"Informes",description:"Consultas e informes disponibles",capability:"informes"},
{id:"admin",name:"Administración",description:"Gestión NEXUS",role:"ADM"}
]);

function bool(v){return v===true||v===1||v==="1"||String(v??"").toLowerCase()==="true"||String(v??"").toLowerCase()==="activo"}
function hasCapability(context,key){
  if(!key)return true;
  if(key==="mns"){
    const m=context?.mns;
    return bool(typeof m==="object"?(m.activo??m.activa??m.enabled??m.habilitado):m);
  }
  if(key==="bitacora"){
    const b=context?.bitacora;
    if(!b)return false;
    if(bool(b.activo??b.activa??b.enabled??b.habilitado))return true;
    const f=b.facultades||{};
    return f.registro===true||f.consulta===true||f.seguimiento===true;
  }
  if(key==="informes"){
    const i=context?.informes||context?.reports;
    return bool(typeof i==="object"?(i.activo??i.activa??i.enabled??i.habilitado):i);
  }
  return false;
}
export function renderModules(container,modules=BASIC_MODULES,context={}){
  const authenticated=context?.authenticated===true;
  const roles=Array.isArray(context?.roles)?context.roles:[];
  container.replaceChildren(...modules.map(m=>{
    const b=document.createElement("button");b.type="button";b.className="module-card";b.dataset.module=m.id;
    const allowed=authenticated&&(!m.role||roles.includes(m.role))&&hasCapability(context,m.capability);
    if(!allowed)b.classList.add("is-locked");
    const s=document.createElement("strong");s.textContent=m.name;
    const d=document.createElement("span");d.textContent=allowed?m.description:(authenticated?"Acceso no habilitado":"Inicia sesión para acceder");
    b.append(s,d);return b;
  }));
}
