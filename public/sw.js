/* Service Worker do MovieFlix — v3: SEM CACHE de assets.
 * Resolve problema de versão antiga "presa" no celular/TV.
 * Apenas repassa requisições (network-only). Não intercepta nada.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Não intercepta fetch — deixa o navegador gerenciar tudo.
// Isso garante que SEMPRE a versão mais recente seja carregada.
