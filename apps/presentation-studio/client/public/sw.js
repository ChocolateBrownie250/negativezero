const CACHE = 'citrine-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

function isCacheableRequest(request, url) {
  return (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !isApiRequest(url) &&
    !url.pathname.endsWith('/sw.js')
  );
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE);
  const safeUrls = urls.filter((rawUrl) => {
    try {
      const url = new URL(rawUrl, self.registration.scope);
      return url.origin === self.location.origin && !isApiRequest(url) && !url.pathname.endsWith('/sw.js');
    } catch {
      return false;
    }
  });
  await Promise.allSettled(
    safeUrls.map(async (url) => {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok && response.type === 'basic') {
        await cache.put(url, response);
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCacheableRequest(event.request, url)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok && response.type === 'basic') {
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match('./index.html')) || (await cache.match('./'));
        }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      return cached || (await network) || (await cache.match('./index.html'));
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil(cacheUrls(event.data.urls));
  }
});
