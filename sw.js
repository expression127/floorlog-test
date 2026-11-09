// Floor Log service worker — caches the app shell so the app opens (and the
// log screen works) with no connection. Never caches API calls: those go
// through the offline write queue in index.html instead.
var CACHE_NAME = 'floorlog-shell-v2';
var SHELL_FILES = [
  './',
  './index.html',
  './config.js',
  './progress.js',
  './validation.js',
  './authorization.js',
  './queue.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return; // never intercept the API's POST calls

  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // never cache cross-origin (the Apps Script backend)

  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
