const CACHE_NAME="nexus-v0.2.19";
const APP_SHELL=["./","./index.html","./css/nexus.css","./js/app.js","./js/context.js","./js/auth.js","./js/navigation.js","./js/modules.js","./js/tv.js","./js/mns.js","./mns-frontend-v052.html","./mns-frontend.html","./manifest.json"];

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
