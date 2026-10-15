import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {tenantKey,acceptTenantContext} from '../js/tv-tenant.js';
const source=fs.readFileSync(new URL('../js/tv.js',import.meta.url),'utf8');
const company=(code,member='member-1')=>({authenticated:true,memberId:member,eo:{codigoEO:code,nombre:'Empresa '+code},tv:{youtubeId:'J8iuaBiKIsk'}});
function harness(){
 const calls=[];
 const ctx={NEXUS_CHANNEL_NAME:'Canal de la empresa',context:null,selected:'eo',channels:[{}],contextGeneration:0,eoLoading:false,tenantKey,acceptTenantContext,setChannel:c=>calls.push(c),renderEoTransmission:()=>{},setTitle:()=>{},renderChannels:()=>{}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('export function setTvContext'),source.indexOf('function stepChannel')).replace('export ',''),ctx);
 return {ctx,calls};
}
test('CH00 rejects unauthenticated or incomplete contexts, even with a video',()=>{
 assert.equal(acceptTenantContext({...company('A'),authenticated:false}),null);
 assert.equal(tenantKey({...company('A'),eo:null}),'');
 assert.equal(tenantKey({...company('A'),memberId:''}),'');
});
test('switching companies resets CH00 even when the video URL is identical',()=>{
 const {ctx,calls}=harness();ctx.setTvContext(company('A'));ctx.setTvContext(company('B'));
 assert.equal(ctx.context.eo.codigoEO,'B');assert.deepEqual(calls,['eo','eo']);assert.equal(ctx.contextGeneration,2);
 assert.equal(ctx.channels[0].nombre,'Empresa B');
});
test('logging out clears private context and resets the monitor',()=>{
 const {ctx,calls}=harness();ctx.setTvContext(company('A'));ctx.selected='CH01';ctx.setTvContext(null);
 assert.equal(ctx.context,null);assert.equal(calls.at(-1),'eo');
});
test('changing members in the same company also invalidates prior responses',()=>{
 const {ctx}=harness();ctx.setTvContext(company('A','one'));ctx.setTvContext(company('A','two'));assert.equal(ctx.contextGeneration,2);
});
test('an old pending response or a response from another EO is never applied',async()=>{
 for(const stale of [true,false]){
 let finish;const applied=[];const ctx={loadContext:()=>new Promise(r=>finish=r),eoLoading:false,context:company('A'),selected:'eo',contextGeneration:1,communityVideoKey:'',tenantKey,setTvContext:x=>applied.push(x),setStreamState:()=>{},console:{warn(){}}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function refreshEo'),source.indexOf('function startEoPolling')),ctx);
 const pending=ctx.refreshEo();if(stale)ctx.contextGeneration++;
 finish(stale?company('A'):company('B'));await pending;assert.equal(applied.length,0);
 }
});
