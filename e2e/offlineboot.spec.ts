import { expect, test, type Page } from '@playwright/test';

/**
 * The installed web app OPENS with no signal.
 *
 * offline.spec.ts already covers editing offline — but only once the app is
 * running. This is the half that was missing and the reason the PWA was the
 * one client that could not open on a train: with no service worker, a phone
 * with no network never receives index.html, and so never reaches the
 * local-first store it already has.
 *
 * The worker is network-first for the document and cache-first for the
 * content-hashed bundles, which is the policy server/public/web.htaccess
 * already publishes — see tools/sw.js.
 */
async function signedIn(page: Page): Promise<string> {
  const user = `ob${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

/** Wait until a worker is actually CONTROLLING the page, not merely registered. */
async function controlled(page: Page) {
  await page.waitForFunction(
    () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller,
    undefined,
    { timeout: 20_000 },
  );
}

test('the app opens with the network off', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signedIn(page);

  await controlled(page);

  // Cut the network at the browser, then load the page from nothing but what
  // the worker kept.
  await context.setOffline(true);
  await page.reload();

  // The real app, not a shell that says "offline": the calendar grid it
  // always opens on, drawn from the local store, with the signed-in name in
  // the bar. Asserted on content rather than on the tab bar, because the tab
  // bar is icons and proves less.
  await expect(
    page.getByTestId('cal-grid'),
    'the app starts from cache with no server at all',
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('topbar-sync').first(), 'still signed in').toBeVisible();
  await expect(page.getByTestId('cal-cell').first(), 'and drawing its own data').toBeVisible();

  await context.setOffline(false);
});

test('online, the document still comes from the network', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page);
  await controlled(page);

  // The half that keeps this safe. A cache-FIRST document is what would let a
  // phone run last week's app against this week's API; network-first must
  // always ask.
  //
  // Watching for "a document request happened" does NOT test this — the
  // browser emits one either way, and a cache-first worker passed that
  // version of the check. What distinguishes them is WHO asked: with
  // network-first the WORKER itself calls fetch, so the request is initiated
  // by the service worker. With cache-first it never does.
  const fromWorker: string[] = [];
  context.on('request', (r) => {
    if (r.serviceWorker() && r.url().includes('/calmind/')) fromWorker.push(r.url());
  });
  await page.reload();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);

  expect(
    fromWorker.some((u) => u.endsWith('/calmind/') || u.includes('index.html')),
    'the worker went to the network for the document rather than serving it blind',
  ).toBe(true);
  await context.setOffline(false);
});

test('the API is never served from cache', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page);
  await controlled(page);

  // Stale sync data would be a data bug, not an annoyance, so the worker does
  // not touch anything under api/. Checked by reading the worker the export
  // actually shipped rather than the source it came from.
  const shipped = await page.evaluate(async () => (await fetch('sw.js')).text());
  expect(shipped, 'the shipped worker skips the API').toContain("url.pathname.includes('/api/')");
  expect(shipped, 'and it is cache-busted per build').toMatch(/calmind-index-[a-f0-9]+\.js/);

  // The shell the worker CANNOT open the app without has to be cached with
  // addAll, which rejects — so a failure fails the install and the browser
  // retries next visit. Caching every entry individually and swallowing the
  // error, which is how this was first written, leaves a worker that installs,
  // takes control, reports itself healthy and cannot open the app: the user
  // finds out on a train. The document and the entry bundle are the two.
  expect(shipped, 'the critical shell is named').toMatch(/const CRITICAL = \[[^\]]*index\.html/);
  expect(shipped, 'and the entry bundle is in it').toMatch(/const CRITICAL = \[[^\]]*_expo\/static\/js\/web\/index-[a-f0-9]+\.js/);
  expect(shipped, 'cached with addAll, which fails loudly').toContain('cache.addAll(CRITICAL)');
});

test('a new build takes its old caches with it', async ({ page }) => {
  test.setTimeout(120_000);
  // The cache is named for the bundle — `calmind-<index-hash>.js` — so every
  // export makes a new one and the activate handler deletes the rest:
  //
  //     keys.filter((k) => k.startsWith('calmind-') && k !== CACHE)
  //         .map((k) => caches.delete(k))
  //
  // Nothing was checking that. If the filter ever went, every deploy would
  // leave its predecessor's whole shell behind for ever, and the symptom is
  // not a broken app — it is storage quietly filling until a snapshot write
  // fails, which the app reports as persistFailed and a person reports as
  // "it lost my note". A leak with someone else's error message on it.
  await signedIn(page);
  await controlled(page);

  const current = await page.evaluate(async () => {
    const keys = await caches.keys();
    return keys.filter((k) => k.startsWith('calmind-'));
  });
  expect(current.length, 'exactly one calmind cache after a clean install').toBe(1);

  // A leftover from an imaginary earlier build, with something in it so it
  // cannot be dismissed as an empty shell the browser tidied itself.
  await page.evaluate(async () => {
    const c = await caches.open('calmind-oldbuild');
    await c.put('./stale.txt', new Response('old'));
  });
  expect(await page.evaluate(() => caches.keys())).toContain('calmind-oldbuild');

  // The sweep runs on ACTIVATE, so it needs a genuinely new worker. A
  // different script URL is what produces one; unregistering and registering
  // the same URL does not — tried, and the old registration simply carries
  // on, which reads exactly like a broken sweep. sw.js calls skipWaiting and
  // clients.claim, so the new one takes over without waiting for tabs.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('sw.js?v=2');
    await navigator.serviceWorker.ready;
  });

  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('calmind-'))),
      { message: 'the previous build\'s cache is swept and the current one kept', timeout: 20_000 })
    .toEqual(current);

  // And the app still works from it, so the sweep did not take the live one.
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
});
