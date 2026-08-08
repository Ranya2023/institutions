// ============================================================
// Service worker — shared by admin/teacher/student/parent/login.
// Strategy: network-first with cache fallback, for both the app
// shell and Supabase REST GET reads. Writes (non-GET) always go
// straight to the network — offline is view-only by design.
// Bump CACHE_VERSION whenever shell files change meaningfully.
// ============================================================
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const SHELL_FILES = [
  'css/theme.css',
  'js/config.js',
  'js/i18n.js',
  'js/supabase-client.js',
  'js/ui-helpers.js',
  'js/pwa-install.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isSupabaseData = url.pathname.includes('/rest/v1/'); // data reads only, not /auth/v1/

  if (isSameOrigin) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
  } else if (isSupabaseData) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ---------- Web Push ----------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Institutions Platform', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Institutions Platform';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    dir: 'rtl',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
