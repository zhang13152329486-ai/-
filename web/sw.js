const CACHE_NAME = "cn-fund-assistant-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js?v=7",
  "./config.js?v=8",
  "./data.js?v=7",
  "./live-data.js?v=7",
  "./fund-manager-data.js?v=7",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
