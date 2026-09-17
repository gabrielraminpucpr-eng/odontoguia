/* OdontoGuia service worker — cache-first for app shell, stale-while-revalidate for fonts
   Importante: incremente CACHE_VERSION a cada publicação no GitHub Pages para forçar atualização offline. */
const CACHE_VERSION = 'odg-v21';
const STATIC_CACHE = `odg-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `odg-runtime-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      // Não chama skipWaiting aqui — a UI pede confirmação ao usuário ("Atualizar").
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('odg-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

async function handleNavigate(request) {
  try {
    const network = await fetch(request);
    if (network && network.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put('./index.html', network.clone());
      return network;
    }
  } catch (_) { /* offline */ }
  const cached =
    (await caches.match(request)) ||
    (await caches.match('./index.html')) ||
    (await caches.match('./'));
  if (cached) return cached;
  return new Response(
    '<!DOCTYPE html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OdontoGuia</title><body style="font-family:system-ui;padding:2rem;background:#f3f0e8;color:#1c2928"><h1>OdontoGuia</h1><p>Sem conexão e cache ainda não disponível. Abra online uma vez para usar offline.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (sameOrigin(url)) {
    // App shell assets: cache-first
    if (
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.includes('/icons/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.js')
    ) {
      event.respondWith(cacheFirst(request, STATIC_CACHE));
      return;
    }
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Google Fonts / remote styles: stale-while-revalidate
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
