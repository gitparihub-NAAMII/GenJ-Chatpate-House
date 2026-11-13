// Service worker: caches the app so it opens and works with no internet.
const CACHE = 'genj-v2';
const ASSETS = [
  './', 'index.html', 'customer.html', 'manifest.json', 'css/style.css',
  'js/i18n.js', 'js/store.js', 'js/sync.js', 'js/excel.js', 'js/requests.js', 'js/customer.js', 'js/app.js',
  'vendor/xlsx.full.min.js', 'vendor/qrcode.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firestore traffic goes straight to the network (the SDK handles its own offline cache)
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('googleapis.com')) return;

  // Firebase SDK files from gstatic: cache-first so sync code is available offline too
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }

  if (url.origin !== location.origin) return;
  // App files: network first (to get updates), fall back to cache when offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html'))));
});

// tapping a "new customer order" notification opens the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => !c.url.includes('customer.html'));
    return win ? win.focus() : self.clients.openWindow('./');
  }));
});
