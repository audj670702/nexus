export const BASIC_MODULES=Object.freeze([
{id:"mns",name:"Mensajería",description:"Comunicación MNS"},
{id:"training",name:"Mis Cursos",description:"Cursos vigentes y completados"},
{id:"docs",name:"Documentos",description:"Documentos disponibles"},
{id:"schedule",name:"Programación",description:"Actividades y agenda"},
{id:"admin",name:"Administración",description:"Gestión NEXUS",role:"ADM"}
]);
export function renderModules(container,modules=BASIC_MODULES,context={}){
  const authenticated=context?.authenticated===true;
  const roles=Array.isArray(context?.roles)?context.roles:[];
  container.replaceChildren(...modules.map(m=>{
    const b=document.createElement("button");b.type="button";b.className="module-card";b.dataset.module=m.id;
    const allowed=authenticated&&(!m.role||roles.includes(m.role));
    if(!allowed)b.classList.add("is-locked");
    const s=document.createElement("strong");s.textContent=m.name;
    const d=document.createElement("span");d.textContent=allowed?m.description:(authenticated?"Acceso no habilitado":"Inicia sesión para acceder");
    b.append(s,d);return b;
  }));
}