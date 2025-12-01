// 🚀 MODO TURBO — SIEMPRE ACTUALIZADO

// Instala y reemplaza al antiguo automáticamente
self.addEventListener("install", event => {
  self.skipWaiting();
});

// Se activa de inmediato en TODOS los tabs
self.addEventListener("activate", event => {
  event.waitUntil(clients.claim());
});

// NO CACHEAMOS NADA → siempre baja la versión nueva del servidor
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request)) // opcional: fallback si querés
  );
});
