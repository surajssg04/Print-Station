// PrintStation Service Worker
// Provides offline shell caching for the PWA upload page

const CACHE_NAME = 'printstation-v1';
const SHELL_ASSETS = [
  '/upload.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// ── Install: cache shell assets ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for shell ───────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network-first for API calls and file uploads
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for upload.html shell (to work offline with a notice)
  if (url.pathname.startsWith('/upload/') || url.pathname === '/upload.html') {
    event.respondWith(
      caches.match('/upload.html').then((cached) => {
        return fetch(event.request).catch(() => cached);
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});