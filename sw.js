// Service worker HOPUR — cache ligero "app shell" + offline básico.
const CACHE = "hopur-v6";
const ASSETS = [
  "./",
  "index.html",
  "nosotros/",
  "servicios/",
  "eventos/",
  "contacto/",
  "app/",
  "app/index.html",
  "app/dashboard/",
  "app/dashboard/index.html",
  "css/styles.css",
  "css/app.css",
  "js/config.js",
  "js/main.js",
  "js/app.js",
  "manifest.json",
  "icons/icon.svg"
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
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match("index.html")))
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

// ---- Web Push: mostrar notificación al recibir un push ----
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { title: "HOPUR", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "HOPUR · Yucatalent";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "icons/icon.svg",
    badge: "icons/icon.svg",
    data: { url: data.url || "app/dashboard/#noticias" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "app/dashboard/#noticias";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
