import { expect, test } from '@playwright/test';

/**
 * Damaged storage must cost you a login, never the app.
 *
 * The boot effect reads the session and its snapshot and then calls
 * setReady(true). Unguarded, ANY failure in between — storage refusing, a
 * session that will not parse, a snapshot that will not parse — threw out of
 * the effect, setReady never ran, and the app sat on its loading screen
 * forever. Not an error, not a login page: a permanent blank that survived
 * every relaunch, because the bad bytes are still there to be read again.
 *
 * Proven before writing this: with the guard removed the login screen is
 * never reached; with it, the app boots. That is what makes this a test
 * rather than decoration.
 *
 * The snapshot is a CACHE of what the server holds, so throwing it away
 * costs a resync and nothing else. The session is a token; losing it costs a
 * sign-in. Neither is worth an app that will not start.
 */
test('a session and snapshot that will not parse still let the app start', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => {
    localStorage.setItem('calmind.session', '{"token":"abc",BROKEN');
    localStorage.setItem('calmind.snapshot.someone', '{{{not json');
  });
  await page.reload();

  // The login card, not a blank screen and not a spinner that never ends.
  await expect(page.getByText('Sign up', { exact: true })).toBeVisible({ timeout: 15_000 });

  // And the unparseable session is GONE, so the next launch is clean rather
  // than meeting the same bytes again.
  const left = await page.evaluate(() => localStorage.getItem('calmind.session'));
  expect(left).toBeNull();
});

test('a good session with a corrupt snapshot signs in and resyncs', async ({ page }) => {
  // Sign up for real so the session is genuine, then damage only the cache.
  const u = `boot${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(u);
  await page.getByPlaceholder('Email').fill(`${u}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 15_000 });

  await page.evaluate((user) => {
    localStorage.setItem(`calmind.snapshot.${user}`, 'not json at all');
  }, u);
  await page.reload();

  // Still signed in — the snapshot was only a cache, and the sync refills it.
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 15_000 });
});
