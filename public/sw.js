/* Service Worker do MovieFlix — cache do "app shell".
 * v2: força atualização em TVs/TV Box que ficaram presas numa versão antiga.
 * Estratégias:
 *  - Navegação: network-first com fallback para o shell em cache (offline).
 *  - Assets estáticos (hasheados pelo Vite): cache-first.
 *  - API (/api/*), o APK e o próprio sw.js nunca são cacheados.
 */
const CACHE_NAME = 'movieflix-shell-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Não intercepta chamadas cross-origin, a API nem o APK.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/apk/')) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Navegação: tenta a rede primeiro; se falhar, devolve o shell em cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || caches.match('/index.html')),
        ),
    );
    return;
  }

  // Assets estáticos: cache-first com cache em segundo plano quando ausente.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
