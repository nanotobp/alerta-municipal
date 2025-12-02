const CACHE_NAME = "asu-v7-" + Date.now();
const urlsToCache = [];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Bloquea totalmente el cache de archivos críticos
self.addEventListener("fetch", (event) => {
  const req = event.request;

  const noCache = [
    "/",
    "/index.html",
    "/home.js",
    "/ciudad.js",
    "/estadisticas.js",
    "/manifest.json"
  ];

  if (noCache.some(path => req.url.includes(path))) {
    event.respondWith(fetch(req));
    return;
  }

  // Otros assets → network first
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
