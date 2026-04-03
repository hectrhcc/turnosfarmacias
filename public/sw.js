const CACHE_NAME = 'turnos-arica-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/vite.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Fallback a la red si no está en cache
      return response || fetch(event.request);
    }).catch(() => {
      // En un caso real aquí se podría devolver un fallback offline
    })
  );
});
