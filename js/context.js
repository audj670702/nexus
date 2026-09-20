// Nexus v0.1.0 · Contexto conceptual. No sustituye SYS.
const emptyContext=Object.freeze({authenticated:false,memberId:null,email:null,user:null,eo:null,cca:null,roles:[],modules:[]});
let currentContext={...emptyContext};
export function getContext(){return {...currentContext};}
export function setContext(next={}){currentContext={...emptyContext,...next};return getContext();}
export function clearContext(){currentContext={...emptyContext};return getContext();}
