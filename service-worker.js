// ==============================
// SERVICE WORKER AsuAlerta v4.1 (fix hard-refresh)
// ==============================

const CACHE_NAME = "asualerta-v4.1";

// ⚠️ IMPORTANTE: no precachear index ni JS críticos
const ASSETS = [
  "/style.css",
  "/manifest.json",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// ------------------------------
// INSTALAR — precache controlado
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
// NETWORK FIRST (sin cache) — uso crítico
// ---------------------------------------
async function networkOnly(req) {
  return fetch(req, { cache: "no-store" });
}

// ---------------------------------------
// ASSETS — cache-first clásico
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
// FETCH: reglas definitivas
// ---------------------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Evitar interferir con subidas de fotos y POST
  if (req.method !== "GET") return;

  // Evitar interferencias con tu Worker backend
  if (url.origin.includes("nanotobp.workers.dev")) return;

  // 🚫 Nunca cachear INDEX ni rutas raíz
  if (url.pathname === "/" || url.pathname.endsWith("index.html")) {
    event.respondWith(networkOnly(req));
    return;
  }

  // 🚫 Nunca cachear JS críticos
  if (
    url.pathname.endsWith("home.js") ||
    url.pathname.endsWith("ui.js") ||
    url.pathname.endsWith("clima.js")
  ) {
    event.respondWith(networkOnly(req));
    return;
  }

  // HTML → networkOnly siempre (para evitar UI congelada)
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkOnly(req));
    return;
  }

  // assets → cache-first
  event.respondWith(cacheFirst(req));
});
