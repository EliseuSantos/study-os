/* StudyOS service worker: offline shell + payload-less web push. */

const VERSION = 'v3';
const CACHE = `studyos-${VERSION}`;
const PRECACHE = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('studyos-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache dynamic endpoints: sync protocol, media proxy, share links,
  // class-progress aggregates (stale-while-revalidate would pin a 204 forever).
  if (
    url.pathname.startsWith('/sync/') ||
    url.pathname.startsWith('/proxy/') ||
    url.pathname.startsWith('/share') ||
    url.pathname.startsWith('/class/')
  ) {
    return;
  }

  // Navigations: network-first so deploys land, cached shell for offline SPA boot.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.includes('/_app/immutable/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin (fonts, icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached ?? refresh;
    }),
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('StudyOS', {
      body: 'lembrete de estudo · abra o app',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow('/');
    }),
  );
});
