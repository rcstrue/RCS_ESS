const CACHE_NAME = 'rcs-ess-v3';
const STATIC_ASSETS = [];

// Install: skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, network-only for navigation, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })))
    );
    return;
  }

  // For navigation requests (HTML pages), always go network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // For images and fonts, return empty response instead of error
          if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
            return new Response('', { status: 200 });
          }
          return new Response('', { status: 408 });
        })
    })
  );
});
