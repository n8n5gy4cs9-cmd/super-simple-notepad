/* Jot service worker.
 * Network-first for everything, so edits to css/js/html are always picked up when online.
 * The cache is only an offline fallback. Bump VERSION on each release. */
var VERSION = '1.0.0';
var CACHE = 'jot-' + VERSION;
var SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.ico', 'icons/icon.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'css/app.css', 'css/fonts.css',
  'js/store.js', 'js/themes.js', 'js/langs.js', 'js/editor.js', 'js/preview.js', 'js/sync.js', 'js/app.js',
  'vendor/codemirror/codemirror.css', 'vendor/codemirror/codemirror.js', 'vendor/codemirror/addon/foldgutter.css',
  'vendor/marked/marked.min.js', 'vendor/dompurify/purify.min.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // best effort: one missing file must not break installation
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;          // never touch the sync API
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        return r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      });
    })
  );
});

self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
