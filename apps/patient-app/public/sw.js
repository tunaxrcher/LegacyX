/**
 * LegacyX Patient PWA — minimal service worker.
 *
 * Strategy: cache-first for the app shell, network-first for /api calls so
 * patients always see fresh visit/wallet data. Bump CACHE_VERSION when you
 * ship UI changes to invalidate the shell cache.
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `legacyx-shell-${CACHE_VERSION}`;
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Network-first for any API call so patients see fresh data.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request)),
    );
    return;
  }

  // Cache-first for shell assets.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        // Only cache successful, basic responses.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }),
  );
});
