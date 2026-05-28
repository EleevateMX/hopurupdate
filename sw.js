// Service worker HOPUR — cache ligero "app shell" + offline básico.
const CACHE = "hopur-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/css/styles.css",
  "/js/config.js",
  "/js/main.js",
  "/manifest.json",
  "/icons/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // No interceptamos llamadas a Supabase ni a terceros (fuentes, CDNs).
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, cae a cache si no hay conexión.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Recursos estáticos: cache primero, actualiza en segundo plano.
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
