/* Study Buddy service worker
   Caches the app shell only (index.html, built assets, icons, fonts). /api is NEVER cached.
   Page loads: network first (updates arrive immediately), cache when offline.
   Content-hashed assets: cache first, their content never changes. */
const CACHE = "sb-shell-v1";
const SCOPE = self.registration.scope;              // e.g. https://example.com/ or https://example.com/study/
const SHELL = ["", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"].map((p) => SCOPE + p);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** After each new index.html: drop cached assets the new build no longer references. */
async function prune(html) {
  const used = new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => SCOPE + m[1]));
  const c = await caches.open(CACHE);
  for (const req of await c.keys()) {
    if (req.url.startsWith(SCOPE + "assets/") && !used.has(req.url) && !/\.(woff2?|ttf)$/.test(req.url)) await c.delete(req);
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  const path = req.url.slice(SCOPE.length);
  if (path.startsWith("api/") || path === "api" || path === "sw.js") return;   // the API and the service worker itself: always network

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-store" });
        if (res.ok) {
          const copy = res.clone();
          const c = await caches.open(CACHE);
          await c.put(SCOPE, copy.clone());
          copy.text().then(prune).catch(() => {});
        }
        return res;
      } catch {
        return (await caches.match(SCOPE)) || Response.error();
      }
    })());
    return;
  }

  if (path.startsWith("assets/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // icons, manifest: network, cache as fallback
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req).then((r) => r || Response.error())));
});
