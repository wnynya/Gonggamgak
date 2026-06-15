const CACHE_NAME = 'interactive-art-tab-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './TemplateData/style.css',
  './TemplateData/favicon.ico',
  './TemplateData/webmemd-icon-192.png',
  './TemplateData/webmemd-icon-512.png',
  './TemplateData/fullscreen-button.png',
  './TemplateData/unity-logo-dark.png',
  './TemplateData/webgl-logo.png',
  './TemplateData/progress-bar-empty-light.png',
  './TemplateData/progress-bar-full-dark.png',
  './Build/InteractiveArt1.loader.js',
  './Build/InteractiveArt1.framework.js.unityweb',
  './Build/InteractiveArt1.data.unityweb',
  './Build/InteractiveArt1.wasm.unityweb'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});
