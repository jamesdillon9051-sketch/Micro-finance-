/*
 * Service worker for Micro Finance.
 *
 *  - Offline: the app shell and every built asset are cached, so it opens with no connection.
 *    All user data lives in localStorage, so nothing else is needed to work offline.
 *  - Notifications: the page asks this worker to display them (required on iOS, where
 *    `new Notification()` doesn't work in an installed web app) and handles taps on them.
 *
 * The build replaces __BUILD_ID__ with a hash of the output, so every release gets a fresh
 * cache and the old one is deleted when the new worker activates.
 */
const BUILD_ID = '__BUILD_ID__';
const CACHE = `micro-finance-${BUILD_ID}`;
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Cache the hashed JS/CSS that index.html points at, so the very first visit already works offline.
      const html = await (await fetch('/index.html', { cache: 'reload' })).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('micro-finance-') && name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Pages: try the network briefly (so updates arrive), otherwise fall back to the cached app. */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    if (response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch {
    // "/?tab=bills" and "/?action=log" are all the same single-page app, so one cached page serves them.
    return (await cache.match('/index.html')) ?? (await cache.match('/')) ?? Response.error();
  }
}

/** Everything else is content-hashed or versioned with the cache, so the cache can answer first. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', url: target });
      } else {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
