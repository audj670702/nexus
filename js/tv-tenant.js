// Only authenticated SYS contexts with a member and EO may supply CH 00.
export function tenantKey(context){
  const member=String(context?.memberId||'').trim();
  const eo=String(context?.eo?.codigoEO||context?.eo?._id||context?.eo?.id||'').trim();
  return context?.authenticated===true&&member&&eo?JSON.stringify([member,eo]):'';
}
export function acceptTenantContext(context){
  return tenantKey(context)?context:null;
}
