import { expect, test, type Page } from '@playwright/test';

/**
 * A sync that HANGS rather than fails.
 *
 * A refused connection rejects at once, is caught, and the app says Offline.
 * A stalled one — a captive portal, a dead middlebox, a server that accepts
 * and never answers — never settles at all. `fetch` has no timeout of its own
 * on the web, and store.tsx has no in-flight guard, so the promise sits there
 * while a 30-second interval starts another one behind it.
 *
 * The symptom is the one this app exists to avoid. `syncLook` gives 'syncing'
 * and 'idle' the SAME accent colour, so the dot a hung sync shows is exactly
 * the dot a healthy one shows: the app looks synced while nothing whatever is
 * reaching the server.
 */
async function signup(page: Page): Promise<string> {
  const user = `sh${String(Date.now()).slice(-7)}`;
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

test('a sync that never answers does not leave the app looking synced', async ({ page }) => {
  test.setTimeout(180_000);
  const user = await signup(page);

  // Every sync from here on is accepted and never answered.
  let hung = 0;
  await page.route('**/api/index.php*', async (route) => {
    if ((route.request().postData() ?? '').includes('"sync"')) {
      hung += 1;
      await new Promise(() => {});      // never resolves, never rejects
      return;
    }
    await route.continue();
  });

  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('vanishing act');
  await page.getByTestId('rem-add-field').press('Enter');

  // Give it well past one poll interval.
  // Well past three poll intervals. Before the in-flight guard this reached
  // FOUR stuck requests in ninety-five seconds — one per interval, each
  // holding a socket, none of them ever recovering — because the poll fires
  // whether or not the last one finished.
  await page.waitForTimeout(95_000);
  expect(hung, 'at least one sync is stuck').toBeGreaterThan(0);
  expect(
    hung,
    `${hung} stalled syncs in 95s — the poll is stacking them instead of waiting`,
  ).toBeLessThanOrEqual(2);

  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(
    page.getByText('Online — synced'),
    'a stalled sync must not read as synced',
  ).toHaveCount(0, { timeout: 15_000 });
});
