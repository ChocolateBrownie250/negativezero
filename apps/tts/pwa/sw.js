// Service worker for the Amethyst PWA.
//
// Strategy: stale-while-revalidate for static shell assets.
//   1. On a request, return the cached version immediately if present
//      (fast paint — feels instant even on bad networks).
//   2. In parallel, refetch from network and replace the cache entry.
//   3. On the *next* visit, the user sees the new version — automatic
//      update propagation without manually bumping the cache version.
//
// API calls always go to the network — never cached here.
//
// Path-agnostic: relative URLs resolve against the SW's own location, so
// this works whether the PWA is served from "/" or "/vtt-transcriber/".
//
// You only need to bump CACHE when:
//   • The shell file list changes (new file in SHELL[]), or
//   • You want to forcibly purge ALL clients (e.g., a security fix).
// Routine CSS/JS edits no longer require a bump — SWR handles them.
const CACHE = "amethyst-shell-v9";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Never cache API calls, regardless of path prefix.
  if (url.pathname.includes("/api/")) return;
  if (e.request.method !== "GET") return;
  // Don't try to cache cross-origin requests (we don't host them anyway).
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const networkPromise = fetch(e.request).then(resp => {
          // Only stash successful, basic-type responses to avoid caching
          // 404 pages or opaque cross-origin redirects.
          if (resp.ok && resp.type === "basic") {
            cache.put(e.request, resp.clone()).catch(() => {});
          }
          return resp;
        }).catch(() => null);
        // Stale-while-revalidate: return cached if we have it (fire-and-forget
        // the network fetch to refresh for next time); else wait for network.
        // If both fail (rare: no cache + offline), fall back to index.html
        // so the SPA shell still loads.
        return cached
          || networkPromise
          || cache.match(new URL("./index.html", self.registration.scope).href);
      })
    )
  );
});

// Allow the page to ask the SW to skip its waiting phase (used by the
// "new version available" banner if we ever add one — currently the SW
// already self-skips on install).
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
