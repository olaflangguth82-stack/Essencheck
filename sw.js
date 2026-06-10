/* EssCheck Service Worker – schneller Start & Offline-Unterstützung */
const CACHE = "esscheck-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Strategie: Sofort aus dem Cache antworten, im Hintergrund aktualisieren
   (stale-while-revalidate). Updates greifen damit beim nächsten App-Start. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const cacheable =
    url.origin === self.location.origin ||
    url.hostname.endsWith("jsdelivr.net") ||        /* Scanner-Engine */
    url.hostname.endsWith("fonts.googleapis.com") || /* Schrift-CSS */
    url.hostname.endsWith("fonts.gstatic.com") ||    /* Schrift-Dateien */
    url.hostname.endsWith("openfoodfacts.org");      /* bereits gescannte Produkte */
  if (!cacheable) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const freshFetch = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === "opaque")) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        e.waitUntil(freshFetch); /* Hintergrund-Update zu Ende laufen lassen */
        return cached;
      }
      const fresh = await freshFetch;
      return fresh || new Response("Offline – keine gespeicherte Version vorhanden.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    })
  );
});
