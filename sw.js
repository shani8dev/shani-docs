const SHELL_CACHE = 'shanidocs-shell-v1';
const DOC_CACHE   = 'shanidocs-docs-v1';
const SHELL = [
  '/',
  '/index.html',
  '/404.html',
  '/brand-shani.css',
  '/style-docs.css',
  '/config-docs.js',
  '/nav-docs.js',
  '/script-docs.js',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // 1) App shell — cache first
  if (SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(request).then(c => c || fetch(request)));
    return;
  }

  // 2) Markdown docs — stale-while-revalidate
  if (url.pathname.endsWith('.md')) {
    e.respondWith(
      caches.open(DOC_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const network = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 3) Everything else — network with cache fallback
  e.respondWith(fetch(request).catch(() => caches.match(request)));
});
