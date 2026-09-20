import {getContext} from "./context.js";
// Adaptador: la implementación definitiva consumirá Wix/SYS/CCA. Sin identidades hardcodeadas.
export async function resolveAccessContext(){return getContext();}
export function canAccessRole(requiredRole){if(!requiredRole)return true;return (getContext().roles||[]).includes(requiredRole);}
