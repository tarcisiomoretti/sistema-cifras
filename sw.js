/* Service worker do Sistema de Cifras.
   Aumente CACHE_VERSION sempre que publicar uma versão nova. */
const CACHE_VERSION = 'cifras-v16';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './theme-init.js',
  './app.js',
  './manifest.webmanifest',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/mammoth.browser.min.js',
  './vendor/jszip.min.js',
  './vendor/pdf-lib.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/icon-180.png'
];

/* Arquivos que devem ser buscados na rede primeiro (podem mudar sem trocar a versão). */
const NETWORK_FIRST = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: tenta a rede e cai para o app guardado quando estiver offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Arquivos marcados para buscar na rede primeiro (hoje nenhum).
  const isNetworkFirst = NETWORK_FIRST.some((asset) => url.pathname.endsWith(asset.slice(1)));
  if (isNetworkFirst) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Arquivos do app: cache primeiro, rede depois.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
