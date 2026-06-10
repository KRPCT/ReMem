// Production service worker (PWA Phase-1 stub).
//
// Correctness over offline-completeness: the previous version used a
// stale-while-revalidate strategy (`return cached || network`) AND
// precached the app shell "/", so it served the OLD page on every load
// ("old version" pages + cache bleed + chunk/hydration errors). This
// version is NETWORK-FIRST for anything that can change between builds
// (navigations, RSC payloads, /_next/ output, APIs) and only cache-first
// for genuinely static same-origin assets.
//
// Bumped v1 -> v2 so the old "remem-v1" cache is purged on activate.
const CACHE_NAME = "remem-v2";
// NOT the HTML shell "/" — only static assets that are safe to serve from
// cache. Navigations always go to the network (see fetch handler).
const PRECACHE = ["/manifest.webmanifest", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE))
  );
  // Take over as soon as installed so the old SW + its cache stop serving.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Only mediate same-origin GETs; cross-origin (fonts, etc.) go direct.
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  // App content that changes between deploys MUST be network-first so the
  // user never gets a stale page shell or a chunk from a previous build.
  const isAppContent =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/");

  if (isAppContent) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Static same-origin assets (icons, logo, manifest): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      });
    })
  );
});
