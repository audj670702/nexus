export const BASIC_MODULES=Object.freeze([
{id:"mns",name:"Mensajería",description:"Comunicación MNS"},
{id:"training",name:"Mis Cursos",description:"Cursos vigentes y completados"},
{id:"docs",name:"Documentos",description:"Documentos disponibles"},
{id:"schedule",name:"Programación",description:"Actividades y agenda"},
{id:"bitacora",name:"Bitácora",description:"Eventos y seguimiento",capability:"bitacora"},
{id:"cte",name:"Atención al Cliente",description:"Atención y seguimiento de tickets",roles:["CLIENTE","ADM"]},
{id:"reports",name:"Informes",description:"Consultas e informes disponibles",capability:"informes"},
{id:"admin",name:"Administración",description:"Gestión NEXUS",role:"ADM"}
]);

function bool(v){return v===true||v===1||v==="1"||String(v??"").toLowerCase()==="true"||String(v??"").toLowerCase()==="activo"}
function hasCapability(context,key){
  if(!key)return true;
  if(key==="mns"){
    const m=context?.mns;
    if(m==null)return false;
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
    if(i==null)return false;
    return bool(typeof i==="object"?(i.activo??i.activa??i.enabled??i.habilitado):i);
  }
  return false;
}
export function renderModules(container,modules=BASIC_MODULES,context={}){
  const authenticated=context?.authenticated===true;
  const roles=(Array.isArray(context?.roles)?context.roles:[]).map(r=>String(r||"").trim().toUpperCase());
  const isAdm=roles.includes("ADM");
  const visible=authenticated?modules.filter(m=>{
    if(m.id==="admin")return isAdm;
    if(Array.isArray(m.roles)&&m.roles.length)return m.roles.some(role=>roles.includes(String(role).toUpperCase()));
    return hasCapability(context,m.capability);
  }):modules.filter(m=>m.id!=="admin"&&!Array.isArray(m.roles));
  container.replaceChildren(...visible.map(m=>{
    const b=document.createElement("button");b.type="button";b.className="module-card";b.dataset.module=m.id;
    const roleAllowed=!m.role||roles.includes(String(m.role).toUpperCase());
    const rolesAllowed=!Array.isArray(m.roles)||m.roles.some(role=>roles.includes(String(role).toUpperCase()));
    const allowed=authenticated&&roleAllowed&&rolesAllowed&&hasCapability(context,m.capability);
    if(!allowed)b.classList.add("is-locked");
    const s=document.createElement("strong");s.textContent=m.name;
    const d=document.createElement("span");d.textContent=allowed?m.description:"Inicia sesión para acceder";
    b.append(s,d);return b;
  }));
}
