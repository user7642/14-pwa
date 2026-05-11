/* global workbox self */
importScripts("https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js");

if (workbox) {
  // Workbox 7 deprecates core.skipWaiting(); use the Service Worker lifecycle API instead.
  self.skipWaiting?.();
  workbox.core.clientsClaim();

  // HTML: prefer fresh content when online.
  workbox.routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    new workbox.strategies.NetworkFirst({
      cacheName: "html-cache",
      networkTimeoutSeconds: 4,
    }),
  );

  // CSS/JS: stale while revalidate for app shell assets.
  workbox.routing.registerRoute(
    ({ request }) => request.destination === "style" || request.destination === "script",
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "static-assets-cache",
    }),
  );

  // Never cache manifest so app always sees regenerated media-manifest.json immediately.
  workbox.routing.registerRoute(
    ({ url }) =>
      url.pathname.endsWith("/assets/media-manifest.json") ||
      url.pathname.endsWith("/media-manifest.json"),
    new workbox.strategies.NetworkOnly(),
  );

  // Icons only: cache first.
  workbox.routing.registerRoute(
    ({ url, request }) =>
      request.destination === "image" && url.pathname.includes("/assets/icons/"),
    new workbox.strategies.CacheFirst({
      cacheName: "icons-cache",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 40,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        }),
      ],
    }),
  );

  // Never cache media because media is persisted in OPFS.
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.includes("/assets/media/"),
    new workbox.strategies.NetworkOnly(),
  );
}
