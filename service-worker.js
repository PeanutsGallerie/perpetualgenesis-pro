// service-worker.js
// Simple offline-first cache with safe install (won't fail if an optional asset 404s)

const CACHE_NAME = "perpetualgenesis-v1";

const ASSETS = [
  ".",
  "index.html",
  "manifest.json",
  "Manifest.json",
  "backup.js",
  "calculator.js",
  "core.js",
  "css.css",
  "entitlements.js",
  "features.js",
  "inventory.js",
  "layout.js",
  "mygarden.js",
  "perpetual-genesis-header.png",
  "perpetual.js",
  "pricing.js",
  "pwa.js",
  "service-worker.js",
  "spacing.js",
  "styles.css",
  "theme.js",
  "timeline.js",
  "utils.js",
  "icons/icon-192x192.png",
  "icons/icon-512x512.png",
  "icons/icon-192x192-maskable.png",
  "icons/icon-512x512-maskable.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      ASSETS.map((url) => cache.add(url).catch(() => null))
    );
    self.skipWaiting();
  })());
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

// FETCH
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // SPA navigation: return cached index.html if offline
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put("index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match("index.html");
        return cached || Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
