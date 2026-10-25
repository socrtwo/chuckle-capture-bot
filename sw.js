// Service worker for offline support.
//
// All cache entries are resolved relative to this worker's directory so the
// app works from a sub-directory deployment (GitHub Pages, "./" Vite base) as
// well as from the site root.

const CACHE_PREFIX = 'smile-camera-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;

// Populated at build time by the precache plugin in vite.config.ts with the
// hashed JS/CSS/asset files Vite emitted and the face-api model URLs. The
// unbuilt copy in public/ keeps these empty.
self.__PRECACHE_MANIFEST = ["assets/index-BhCiYqh2.js","assets/index-JH0UxbRq.css"];
self.__MODEL_URLS = ["https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model-weights_manifest.json","https://raw.githubusercontent.com/vladmandic/face-api/master/model/tiny_face_detector_model.bin","https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_landmark_68_model-weights_manifest.json","https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_landmark_68_model.bin","https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_expression_model-weights_manifest.json","https://raw.githubusercontent.com/vladmandic/face-api/master/model/face_expression_model.bin"];

const BASE_URL = new URL('./', self.location.href);
const resolve = (relativePath) => new URL(relativePath, BASE_URL).href;

const APP_SHELL = ['./', './index.html', './manifest.json'];
const PRECACHE_URLS = Array.from(
  new Set([...APP_SHELL, ...self.__PRECACHE_MANIFEST].map(resolve))
);
const MODEL_URLS = self.__MODEL_URLS;

// Install: precache the app shell, the build assets and the ML models.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // App shell + build output: required, so a failure aborts installation.
      await cache.addAll(PRECACHE_URLS);
      // Models are cross-origin and large; cache them one by one so that a
      // single failure does not block installation. They are also cached on
      // first use by the fetch handler below.
      await Promise.allSettled(MODEL_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

// Activate: remove this application's older caches only. CacheStorage is
// shared across the origin, so other apps' caches must be left alone.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: cache-first for static assets, network-first for navigation/HTML.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cache-first for static assets (JS, CSS, images, fonts, ML models)
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|json|bin|shard)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for navigation/HTML, falling back to the cached app shell.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match(resolve('./index.html'));
        }
        return undefined;
      })
  );
});
