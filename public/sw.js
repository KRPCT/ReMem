// Production service worker (PWA).
//
// Goal: make the app usable over a HIGH-LATENCY / flaky bare-IP link (the
// self-host scenario) WITHOUT reintroducing the old "stale shell / cross-build
// chunk / ChunkLoadError" regression and WITHOUT leaking user-scoped pages.
//
// The dominant cost on a slow link was that the previous SW treated ALL of
// /_next/ as network-first, so every navigation re-downloaded the full JS/CSS
// chunk graph over the slow network — the "经常性缓冲" / PWA freeze. The fix is to
// serve the IMMUTABLE, content-hashed build output from cache:
//
//   - /_next/static/*  -> CACHE-FIRST. These URLs are content-hashed: a given
//     URL never changes bytes between builds (a new build ships NEW urls). So
//     a cached chunk is never wrong, and after the first load the whole chunk
//     graph comes from cache with zero network — the big win.
//
// Everything that is user-scoped or changes between deploys stays NETWORK-FIRST
// and is DELIBERATELY NOT CACHED, because caching it is what caused both past
// failure classes:
//   - caching navigation HTML / RSC let a stale shell from build A be served
//     after a redeploy and then 404 on a build-A lazy chunk that build B had
//     deleted -> ChunkLoadError;
//   - it also persisted authenticated pages in a shared cache, surfacing one
//     user's decks/settings to another session or after logout.
// Navigations / RSC / dynamic /_next/ / /api therefore always hit the network
// (fresh, single request — the heavy part, the chunks, is already cached).
//
// Bumped v2 -> v3 so older caches are purged on activate.
const CACHE_NAME = "remem-v3";
// Genuinely static, non-build-pinned assets (NOT the HTML shell "/").
const PRECACHE = ["/manifest.webmanifest", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  // Take over immediately so the old SW + its cache stop serving.
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

// Cache-first: serve from cache when present, else fetch + cache (only clean
// same-origin 200s). Falls back to any cached copy on a network error, and to a
// network-error Response (never `undefined`, which respondWith rejects).
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === "basic") {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

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

  // 1) Immutable, content-hashed build output: cache-first (the slow-link win).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 2) Anything user-scoped or build-varying: navigations, RSC payloads,
  //    dynamic /_next/ (data/image), and APIs. ALWAYS network-first, NEVER
  //    cached — a cached copy here is what caused the stale-shell / ChunkLoad /
  //    cross-session-leak bugs. On a network error, surface a valid
  //    network-error Response (not `undefined`).
  const accept = req.headers.get("accept") || "";
  const isDynamic =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.searchParams.has("_rsc") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/api/");
  if (isDynamic) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // 3) Other genuinely-static same-origin assets (icons / logo / manifest /
  //    sample files): cache-first.
  event.respondWith(cacheFirst(req));
});
