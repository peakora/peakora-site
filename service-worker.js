const CACHE_NAME = "peakora-cache-v1";

const FILES_TO_CACHE = [
  "/peakora-site/",
  "/peakora-site/index.html",
  "/peakora-site/assistant.html",
  "/peakora-site/assistant.css",
  "/peakora-site/manifest.json",
  "/peakora-site/assets/peakora-logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
