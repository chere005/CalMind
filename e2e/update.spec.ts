import { expect, test } from '@playwright/test';

/**
 * Taking a newer build without being asked, and — much more importantly —
 * not taking one over and over.
 *
 * An installed home-screen app is resumed rather than reloaded, so it can sit
 * on an old page indefinitely while every deploy passes it by. That was
 * measured on the simulator: a read-out confirmed present in the SERVED
 * bundle never appeared in the installed app across several relaunches.
 *
 * The failure mode of the fix is far worse than the bug, which is why the
 * second test here is the one that matters: a version check that answers
 * wrongly, or a reload that lands on the same page it started from, is an app
 * that reloads for ever and can never be used at all.
 */
const NEW_BUNDLE = 'index-00000000000000000000000000000000.js';

test('a build the server no longer serves is replaced, once', async ({ page }) => {
  test.setTimeout(60_000);

  // The server is made to advertise a DIFFERENT entry bundle than the one the
  // page is running, which is exactly the shape of a deploy that has landed
  // while this page stayed open.
  let served = 0;
  await page.route('**/index.html?**', async (route) => {
    served++;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!DOCTYPE html><html><body><script src="/test/calmind/_expo/static/js/web/${NEW_BUNDLE}"></script></body></html>`,
    });
  });

  const navigations: string[] = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });

  // It noticed and moved to a fresh URL, which is what forces a real fetch
  // rather than whatever the cache still has.
  await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('b=');
  expect(served, 'it asked the server what it is serving').toBeGreaterThan(0);

  // And then it settles. Give it long enough to have gone round several times
  // if it were going to: the check runs on open and on every return to
  // visibility, so a wrong answer here is an app that can never be used.
  const after = navigations.length;
  await page.waitForTimeout(3_000);
  expect(navigations.length, `it reloaded and stopped; urls: ${JSON.stringify(navigations.slice(-4))}`)
    .toBe(after);
});

test('the ordinary case is no reload at all', async ({ page }) => {
  test.setTimeout(60_000);
  const navigations: string[] = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3_000);

  // One navigation: the one this test asked for. The page is running exactly
  // what the server is serving, so there is nothing to do and it must do
  // nothing — including on the check that runs at open.
  expect(navigations.length, `a current page must sit still; urls: ${JSON.stringify(navigations)}`).toBe(1);
  expect(page.url()).not.toContain('b=');
});
