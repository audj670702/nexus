const CACHE_NAME = "nexus-v0.1.1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/nexus.css",
  "./js/app.js",
  "./js/context.js",
  "./js/auth.js",
  "./js/navigation.js",
  "./js/modules.js",
  "./js/tv.js",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
