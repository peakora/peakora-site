// Copyright (c) 2026 Peakora. All rights reserved. Licensed under the MIT License; see NOTICE and LICENSE.
const CACHE_VERSION = "v15-assistant-live";
const CACHE_NAME = `peakora-cache-${CACHE_VERSION}`;

const OFFLINE_URL = "./offline.html";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./affiliate.html",
  "./assistant.css",
  "./css/styles.css",
  "./assistant-onboarding.html",
  "./assistant-home.html",
  "./manifest.json",
  "./offline.html",
  "./service-worker.js",
  "./favicon.ico",
  "./assets/peakora-logo.png",
  "./assets/hub-logo.png?v=3",
  "./assets/hub-logo-192.png?v=3",
  "./assets/hub-logo-512.png",
  "./cookie-banner.js?v=1"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // addAll fails entirely if any file 404s, so add individually
      Promise.allSettled(FILES_TO_CACHE.map(f => cache.add(f)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("peakora-cache-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(response => {
        return response || caches.match(OFFLINE_URL);
      })
    )
  );
});

/* Web Push — gentle nudges delivered even when the app is closed */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Peakora", {
      body: data.body || "A gentle nudge from your quiet corner.",
      icon: "./assets/hub-logo.png?v=2",
      badge: "./assets/hub-logo-192.png?v=2",
      tag: "peakora-nudge",
      renotify: false
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes("assistant") && "focus" in client) return client.focus();
      }
      return clients.openWindow("./assistant.html");
    })
  );
});
