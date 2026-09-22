// Nexus v0.2.0 · Estado de sesión NEXUS.
// Sesión Wix/memberId y sesión NEXUS son conceptos distintos.
// authenticated=true únicamente cuando NEXUS recibe un contexto USR+EO+Activo válido desde Wix/SYS.
const emptyContext=Object.freeze({
  authenticated:false,
  memberId:null,
  email:null,
  user:null,
  eo:null,
  cca:null,
  roles:[],
  modules:[]
});
let currentContext={...emptyContext};

export function getContext(){return {...currentContext,roles:[...(currentContext.roles||[])],modules:[...(currentContext.modules||[])]};}

export function setContext(next={}){
  const authenticated=next?.authenticated===true;
  currentContext=authenticated
    ? {...emptyContext,...next,authenticated:true,roles:Array.isArray(next.roles)?next.roles:[],modules:Array.isArray(next.modules)?next.modules:[]}
    : {...emptyContext};
  return getContext();
}

export function clearContext(){currentContext={...emptyContext};return getContext();}
export function hasNexusSession(){return currentContext.authenticated===true;}
