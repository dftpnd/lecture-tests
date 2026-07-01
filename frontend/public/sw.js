// Simple offline-capable service worker for the "Темы → Тесты" PWA.
// Bump CACHE on each release to evict the old app shell.
const CACHE = "lt-cache-v4";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests; let everything else (API, uploads) pass through.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // SPA navigations: serve the cached app shell first so a reload never depends
  // on the network (a network-first navigate can strand an installed PWA on the
  // browser's offline error page). The shell is a static bundle-loader; fresh
  // data is fetched by the app afterwards, and new bundles roll out via the
  // controllerchange reload in main.tsx, so cached-first costs us nothing here.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
            }
            return response;
          })
          .catch(() => cached || caches.match("/"));
        return cached || network;
      })
    );
    return;
  }

  // Static assets (hashed JS/CSS, icons): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
