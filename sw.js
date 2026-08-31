// sw.js — docs.shani.dev
const SHELL_CACHE = 'shanidocs-20260831';
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
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL))
      // addAll() is all-or-nothing — if a single SHELL url 404s, the whole
      // install silently fails and nothing gets cached. Log which one broke
      // instead of swallowing it, and don't let install() reject outright
      // (better to have a partially-working SW than none at all).
      .catch(err => console.error('[sw] shell precache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(k => k !== SHELL_CACHE && k !== DOC_CACHE)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
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

  // 3) Navigations (doc pages under the SPA router) — network first,
  //    falling back to the cached shell so a mid-air network drop still
  //    renders the app instead of the browser's default offline page.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 4) Everything else — network with cache fallback
  e.respondWith(fetch(request).catch(() => caches.match(request)));
});
