const CACHE_NAME="nexus-v0.3.13";
const APP_SHELL=["./","./index.html","./css/nexus.css","./js/app.js","./js/ui.js","./js/context.js","./js/auth.js","./js/navigation.js","./js/modules.js","./js/tv.js","./js/tv-model.js","./js/tv-tenant.js","./js/mns.js","./js/documents.js","./js/schedule.js","./js/bitacora.js","./js/cte.js","./js/local-first.js","./js/back-nav.js","./js/modes.js","./mns-frontend-v052.html","./mns-frontend.html","./manifest.json","./css/nexus.css?v=0.3.13","./js/app.js?v=0.3.13","./js/tv.js?v=0.3.13","./js/tv-model.js?v=0.3.13","./js/tv-tenant.js?v=0.3.13"];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({type:"window"}))
      .then(clients=>{
        for(const client of clients)client.postMessage({type:"NEXUS_SW_ACTIVATED",version:CACHE_NAME});
      })
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;

  const url=new URL(event.request.url);
  if(url.origin===self.location.origin){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
