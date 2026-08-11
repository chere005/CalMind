/**
 * THE KILL SWITCH. A service worker whose only job is to remove itself.
 *
 * A broken worker is stickier than a broken deploy: it lives in the browser,
 * keeps serving whatever it cached, and can make the site unloadable for
 * someone who has visited once — a failure worse than the offline gap the
 * real worker exists to close. This is the way back.
 *
 * To use it, in tools/patch-web-html.mjs change the worker it copies:
 *
 *     const WORKER = 'sw-kill.js';   // instead of 'sw.js'
 *
 * then export and deploy as usual. Every browser that already holds the old
 * worker fetches sw.js on its next visit (it is served no-cache for exactly
 * this reason), gets this, empties the caches and unregisters. One more
 * deploy with WORKER back to 'sw.js' restores normal service.
 *
 * It deliberately does NOT claim clients or skip waiting on install alone —
 * it does both, because the whole point is to take effect on the very next
 * load rather than whenever the last tab happens to close.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      // Reload what is open, so the page stops being served by a worker that
      // is on its way out.
      .then((clients) => clients.forEach((c) => c.navigate(c.url))),
  );
});

// While it is still alive, get out of the way entirely: everything goes to
// the network, so nothing it once cached can be served again.
self.addEventListener('fetch', () => {});
