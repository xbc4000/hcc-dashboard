// HCC Dashboard — Service Worker
//
// Strategy:
//  - SHELL (HTML/CSS/JS/fonts/icons): cache-first. Pre-cached on install.
//    Makes the app open instantly even with no network. Bumping SW_VERSION
//    forces all clients to re-cache on next activation.
//  - API (/api/*, /spotify/*): network-first with cache fallback. Always
//    tries fresh data (live monitoring is the whole point); if offline,
//    serves the last successful response so the UI renders something
//    instead of a blank screen.
//  - AUTH (/auth/*): network-only. Never cache login/session flows.
//  - NAVIGATION: network-first with shell fallback — if the network is
//    down entirely, the cached index.html boots and the in-page poll
//    loop picks up whenever connectivity returns.
//
// Bump SW_VERSION on every deploy so returning users pick up the new
// build instead of being pinned to an old cached shell.

const SW_VERSION    = 'hcc-v2-2026-04-11';
const SHELL_CACHE   = 'hcc-shell-' + SW_VERSION;
const RUNTIME_CACHE = 'hcc-runtime-' + SW_VERSION;

const SHELL_ASSETS = [
  // '/' is NOT pre-cached: the Express handler redirects to /login.html
  // when unauthenticated, and we don't want a redirect response stuck in
  // the shell cache. We cache /index.html directly instead (express.static
  // serves it without the auth gate; the in-page poll handles 401 by
  // redirecting to login).
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/css/hcc.css',
  '/js/dashboard.js',
  '/js/effects.js',
  '/vendor/gridstack/gridstack.min.css',
  '/vendor/gridstack/gridstack-all.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

// ── INSTALL: pre-cache the shell ──
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // addAll is atomic: if any asset fails, nothing gets cached and the
      // install fails loudly. Use individual adds so one 404 doesn't block
      // the whole PWA from installing.
      return Promise.all(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] failed to pre-cache', url, err);
          });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: drop old caches ──
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (name) {
          if (name !== SHELL_CACHE && name !== RUNTIME_CACHE) {
            return caches.delete(name);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── FETCH: route requests to the right strategy ──
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return; // only cache GETs

  var url = new URL(req.url);

  // Only handle same-origin requests. Cross-origin (Google Fonts, OBS WS,
  // Spotify CDN album art, etc.) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Never cache auth flows
  if (url.pathname.startsWith('/auth/')) return;

  // API + Spotify proxy: network-first with cache fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/spotify/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Navigation (HTML page loads): network-first, fall back to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Everything else (CSS/JS/images/fonts): cache-first
  event.respondWith(cacheFirst(req));
});

function cacheFirst(req) {
  return caches.match(req).then(function (cached) {
    if (cached) return cached;
    return fetch(req).then(function (resp) {
      // Only cache successful same-origin responses
      if (resp && resp.status === 200 && resp.type === 'basic') {
        var copy = resp.clone();
        caches.open(RUNTIME_CACHE).then(function (cache) {
          cache.put(req, copy);
        });
      }
      return resp;
    });
  });
}

function networkFirst(req) {
  return fetch(req).then(function (resp) {
    if (resp && resp.status === 200) {
      var copy = resp.clone();
      caches.open(RUNTIME_CACHE).then(function (cache) {
        cache.put(req, copy);
      });
    }
    return resp;
  }).catch(function () {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      // No cache, no network — return a synthetic offline response so the
      // UI can render its "AWAITING DATA" state instead of crashing.
      return new Response(JSON.stringify({ offline: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    });
  });
}

// ── MESSAGE: allow the page to force an update ──
// The page can postMessage({ type: 'SKIP_WAITING' }) to activate a new
// worker immediately instead of waiting for all tabs to close.
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
