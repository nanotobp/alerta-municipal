// ==============================
// SERVICE WORKER AsuAlerta v4
// ==============================

const CACHE_NAME = "asualerta-v4";  
const ASSETS = [
  "/", 
  "/index.html",
  "/style.css",
  "/manifest.json",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// ------------------------------
// INSTALAR SW — precache básico
// ------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// ------------------------------
// ACTIVAR — limpiar versiones viejas
// ------------------------------
self.addEventListener("activate", (event) => {
  clients.claim();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

// ---------------------------------------
// REGLA MASTER: HTML siempre = network-first
// ---------------------------------------
async function networkFirst(req) {
  try {
    const fresh = await fetch(req, { cache: "no-store" });
    return fresh;
  } catch (err) {
    const cache = await caches.match(req);
    return cache || Response.error();
  }
}

// ---------------------------------------
// ASSETS (CSS, IMG, Leaflet) = cache-first
// ---------------------------------------
async function cacheFirst(req) {
  const cache = await caches.match(req);
  if (cache) return cache;

  const fresh = await fetch(req);
  const cacheObj = await caches.open(CACHE_NAME);
  cacheObj.put(req, fresh.clone());
  return fresh;
}

// ---------------------------------------
// FILTROS IMPORTANTES
// ---------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  const url = new URL(req.url);

  // No cachear subidas de fotos ni requests POST
  if (req.method !== "GET") return;

  // No cachear peticiones al Worker backend
  if (url.origin.includes("nanotobp.workers.dev")) return;

  // No cachear JS críticos (siempre network exacta)
  if (url.pathname.endsWith("home.js") ||
      url.pathname.endsWith("ui.js") ||
      url.pathname.endsWith("clima.js")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // HTML SIEMPRE network-first
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // assets = cache-first
  event.respondWith(cacheFirst(req));
});
