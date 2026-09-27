// NEXUS · Capa local transversal · v0.1.0
// IndexedDB reutilizable por módulos. Primera implementación: BIT Registro.

const DB_NAME="SCaD_NEXUS_LOCAL";
const DB_VERSION=1;
const STORE_QUEUE="syncQueue";
const STORE_EVIDENCE="evidence";
const STORE_CACHE="referenceCache";

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_QUEUE)){
        const store=db.createObjectStore(STORE_QUEUE,{keyPath:"localId"});
        store.createIndex("module","module",{unique:false});
        store.createIndex("syncStatus","syncStatus",{unique:false});
        store.createIndex("createdLocalAt","createdLocalAt",{unique:false});
      }
      if(!db.objectStoreNames.contains(STORE_EVIDENCE)){
        const store=db.createObjectStore(STORE_EVIDENCE,{keyPath:"evidenceId"});
        store.createIndex("localId","localId",{unique:false});
        store.createIndex("syncStatus","syncStatus",{unique:false});
      }
      if(!db.objectStoreNames.contains(STORE_CACHE))db.createObjectStore(STORE_CACHE,{keyPath:"key"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("No fue posible abrir el almacenamiento local."));
  });
}
function requestResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Error de almacenamiento local."));
  });
}
async function withStore(name,mode,fn){
  const db=await openDb();
  try{
    const tx=db.transaction(name,mode);
    const result=await fn(tx.objectStore(name));
    await new Promise((resolve,reject)=>{
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error("No fue posible completar la operación local."));
      tx.onabort=()=>reject(tx.error||new Error("La operación local fue cancelada."));
    });
    return result;
  }finally{db.close()}
}
export function createLocalId(prefix="local"){
  if(globalThis.crypto?.randomUUID)return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
}
export async function putQueueItem(item){
  return withStore(STORE_QUEUE,"readwrite",store=>requestResult(store.put(item)));
}
export async function getQueueItem(localId){
  return withStore(STORE_QUEUE,"readonly",store=>requestResult(store.get(localId)));
}
export async function listQueueItems(module=""){
  const items=await withStore(STORE_QUEUE,"readonly",store=>requestResult(store.getAll()));
  return (items||[]).filter(x=>!module||x.module===module).sort((a,b)=>String(a.createdLocalAt).localeCompare(String(b.createdLocalAt)));
}
export async function putEvidence(item){
  return withStore(STORE_EVIDENCE,"readwrite",store=>requestResult(store.put(item)));
}
export async function getEvidence(evidenceId){
  return withStore(STORE_EVIDENCE,"readonly",store=>requestResult(store.get(evidenceId)));
}
export async function listEvidence(localId=""){
  const items=await withStore(STORE_EVIDENCE,"readonly",store=>requestResult(store.getAll()));
  return (items||[]).filter(x=>!localId||x.localId===localId);
}
export async function deleteEvidence(evidenceId){
  return withStore(STORE_EVIDENCE,"readwrite",store=>requestResult(store.delete(evidenceId)));
}
export async function putReference(key,value){
  return withStore(STORE_CACHE,"readwrite",store=>requestResult(store.put({key,value,updatedAt:new Date().toISOString()})));
}
export async function getReference(key){
  const item=await withStore(STORE_CACHE,"readonly",store=>requestResult(store.get(key)));
  return item?.value??null;
}
