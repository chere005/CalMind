/**
 * The service worker that lets the installed web app open with no signal.
 *
 * The native apps and the Tauri shell carry their bundle and have always
 * opened offline; the PWA could not, because a phone with no network never
 * gets index.html and so never gets as far as the local-first store it
 * already has. Everything after the first paint already worked offline — this
 * is only about the first paint.
 *
 * IT DOES NOT INVENT A CACHING POLICY. The server already publishes one, in
 * server/public/web.htaccess, and this is that policy expressed a second time
 * for the case where there is no server to ask:
 *
 *   index.html, manifest  no-cache            -> NETWORK FIRST, cache as the
 *                                                offline fallback only
 *   *.js, *.png           immutable, hashed   -> CACHE FIRST, they can never
 *                                                change under their own name
 *
 * The failure this must not cause — a phone running last week's app against
 * this week's API — comes from a cache-FIRST document. Network-first cannot
 * cause it: online, the network always decides, and the cache is only reached
 * when there is nothing to revalidate against, which is exactly when a stale
 * app beats a blank screen.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED:
 *  · anything under api/ — sync is POST, which a worker does not cache in any
 *    case, but being explicit costs nothing and this is the one path where
 *    serving something stale would be a data bug rather than an annoyance;
 *  · cross-origin requests, which are not ours to reason about.
 *
 * THE REAL RISK IS STICKINESS, not staleness: a broken worker persists in the
 * browser and can make the site unloadable — worse than the problem it fixes.
 * Two things guard that. `sw.js` is served no-cache (web.htaccess), so a new
 * one is always picked up rather than being cached immutable by the *.js rule
 * above it; and tools/sw-kill.js is a worker that deletes every cache and
 * unregisters itself, deployable in one push if this one ever misbehaves.
 */

// Rewritten by tools/patch-web-html.mjs on every export, to the entry bundle's
// content hash. A new deploy is therefore a new cache, and the old one is
// dropped on activate — no version number for anyone to forget to bump.
const CACHE = 'calmind-__BUILD__';

/**
 * The shell: what has to be there for the app to start at all.
 *
 * GENERATED at export time from what dist actually contains, and that is not
 * belt-and-braces — it is the whole thing working. A worker does not control
 * the page load that registers it, so the very first visit fetches the bundle
 * without the worker seeing it, and a runtime-only cache is therefore empty
 * of the one file the app cannot start without. The first offline boot failed
 * exactly that way before this list existed.
 */
const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  // waitUntil so the worker is not considered installed until the shell is in.
  // Individually, and tolerating failures: one 404 must not leave the whole
  // install rejected and the app with no offline story at all.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('calmind-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      // Take over open tabs, so the first load after an update is controlled
      // rather than waiting for every tab to close.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never the API: stale sync data would be a data bug, not an annoyance.
  if (url.pathname.includes('/api/')) return;

  // The document. Network first, so an online phone always revalidates and
  // can never be left running an older app than the server has.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })
          .then((hit) => hit || caches.match('./'))
          .then((hit) => hit || Response.error())),
    );
    return;
  }

  // Everything else is content-hashed and declared immutable by the server, so
  // a hit can be served without asking. A miss is fetched and kept.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // Only real, complete responses: caching an opaque or error response
      // would poison the cache with something that never becomes valid.
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })),
  );
});
