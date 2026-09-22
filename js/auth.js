import {getContext,clearContext} from "./context.js";
const SYS_AUTH_URL="https://www.scad.mx/sys-autenticacion";
export async function resolveAccessContext(){return getContext()}
export function startLogin(){
  const u=new URL(SYS_AUTH_URL);
  u.searchParams.set("app","NEXUS");
  u.searchParams.set("returnUrl",window.location.href);
  window.location.assign(u.toString());
}
export function logoutLocal(){clearContext();window.location.reload()}
export function canAccessRole(role){return !role||(getContext().roles||[]).includes(role)}