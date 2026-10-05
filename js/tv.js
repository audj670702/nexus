const TVDI_HLS="https://motortv.scad.mx/hls/canal.m3u8";
let context=null,hls=null,tvMuted=true,communityVideoKey="";
const $=s=>document.querySelector(s);

function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function destroyHls(){if(hls){hls.destroy();hls=null}const v=$("#tvVideo");if(!v)return;v.pause();v.removeAttribute("src");v.load()}
function setPlaceholder(active){const v=$("#tvVideo"),p=$("#tvPlaceholder"),c=$("#tvScreenCenter");if(p)p.hidden=!active;if(c)c.hidden=!active;if(v)v.hidden=active}
function playUrl(url){communityVideoKey="";const c=$("#tvScreenCenter");if(c)c.innerHTML='<span class="tv-play">▶</span>';destroyHls();const v=$("#tvVideo");if(!v||!url){setPlaceholder(true);return}setPlaceholder(false);v.muted=tvMuted;if(/\.m3u8($|\?)/i.test(url)){if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=url;v.play().catch(()=>{});return}if(window.Hls&&Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30});hls.loadSource(url);hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)setPlaceholder(true)});return}}v.src=url;v.play().catch(()=>{})}
function youtubeEmbedUrl(tv){const id=String(tv?.youtubeId||"").trim();if(!id)return"";const start=Math.max(0,Math.floor(Number(tv?.segundoInicio)||0));const u=new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);u.searchParams.set("autoplay","1");u.searchParams.set("mute",tvMuted?"1":"0");u.searchParams.set("playsinline","1");u.searchParams.set("controls","1");u.searchParams.set("rel","0");u.searchParams.set("enablejsapi","1");u.searchParams.set("start",String(start));u.searchParams.set("loop","1");u.searchParams.set("playlist",id);u.searchParams.set("origin",location.origin);return u.toString()}
function sendYoutubeCommand(func){const f=$("#tvCommunityFrame");if(f?.contentWindow)f.contentWindow.postMessage(JSON.stringify({event:"command",func,args:[]}),"https://www.youtube.com")}
function renderEoTransmission(force=false){const tv=context?.tv,id=String(tv?.youtubeId||"").trim(),center=$("#tvScreenCenter");if(!id){communityVideoKey="";destroyHls();setPlaceholder(true);if(center)center.innerHTML='<span class="tv-play">▶</span>';return}const key=`${tv?.modo||""}:${id}`;if(!force&&communityVideoKey===key)return;communityVideoKey=key;destroyHls();const v=$("#tvVideo"),p=$("#tvPlaceholder");if(v)v.hidden=true;if(p)p.hidden=false;if(center){center.hidden=false;center.innerHTML=`<iframe id="tvCommunityFrame" class="tv-youtube-frame" src="${esc(youtubeEmbedUrl(tv))}" title="${esc(tv.titulo||"TV SCaD")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`}}
function playEo(){renderEoTransmission(true)}
function setChannel(ch){const m=$("#tvMonitor");if(m)m.dataset.channel=ch;document.querySelectorAll(".channel[data-channel]").forEach(b=>b.classList.toggle("is-active",b.dataset.channel===ch));const nl=$("#tvNowLabel");if(nl)nl.textContent=ch==="eo"?($("#eoChannelName")?.textContent||"EO"):"TV Digital";if(ch==="eo")playEo();else playUrl(TVDI_HLS)}
export function setTvContext(next){context=next||null;if($("#tvMonitor")?.dataset.channel==="eo")playEo()}
// v0.3.3 · Pantalla completa del monitor.
// 1) API nativa (Android, escritorio, iPad). 2) iPhone con canal de video: reproductor nativo.
// 3) Si nada de lo anterior existe (iPhone con YouTube): el monitor ocupa toda la pantalla
//    dentro de la app, con botón para salir; el botón Atrás también lo cierra.
function closeTvOptions(){const o=$("#tvOptions"),t=$("#btnTvOptions");if(o&&!o.hidden){o.hidden=true;t?.setAttribute("aria-expanded","false")}}
function nativeFsElement(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function enterTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.add("tv-fs");if(layer)layer.hidden=false;try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}
function exitTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.remove("tv-fs");if(layer&&!layer.hidden)layer.hidden=true;try{screen.orientation?.unlock?.()}catch{}}
function toggleTvFullscreen(){
  const m=$("#tvMonitor");if(!m)return;
  if(nativeFsElement()){const ex=document.exitFullscreen||document.webkitExitFullscreen;try{ex?.call(document)?.catch?.(()=>{})}catch{}return}
  if(document.body.classList.contains("tv-fs")){exitTvPseudoFullscreen();return}
  const req=m.requestFullscreen||m.webkitRequestFullscreen;
  if(req){
    closeTvOptions();
    try{const r=req.call(m);if(r&&typeof r.then==="function"){r.then(()=>{try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}).catch(()=>setTimeout(enterTvPseudoFullscreen,200))}return}catch{}
  }
  const v=$("#tvVideo");
  if(m.dataset.channel!=="eo"&&v&&!v.hidden&&typeof v.webkitEnterFullscreen==="function"){try{v.webkitEnterFullscreen();closeTvOptions();return}catch{}}
  closeTvOptions();setTimeout(enterTvPseudoFullscreen,200);
}
export function initTv(){const m=$("#tvMonitor"),x=$("#btnTvExpand"),c=$(".tv-controls");if(!m||!c)return;m.dataset.channel="eo";c.addEventListener("click",e=>{const b=e.target.closest("[data-channel]");if(b)setChannel(b.dataset.channel)});x?.addEventListener("click",()=>toggleTvFullscreen());$("#btnCloseTvFs")?.addEventListener("click",exitTvPseudoFullscreen);document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.body.classList.contains("tv-fs"))exitTvPseudoFullscreen()});$("#btnTvMute")?.addEventListener("click",()=>{tvMuted=!tvMuted;const v=$("#tvVideo"),i=$("#tvMuteIcon");if(v)v.muted=tvMuted;if(i)i.innerHTML=tvMuted?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';const tt=$("#tvMuteText");if(tt)tt.textContent=tvMuted?"Activar sonido":"Silenciar";if(m.dataset.channel==="eo")sendYoutubeCommand(tvMuted?"mute":"unMute");else if(!tvMuted)v?.play().catch(()=>{})});setChannel("eo")}
