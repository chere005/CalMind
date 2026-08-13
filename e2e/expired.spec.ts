import { expect, test } from '@playwright/test';

/**
 * A session that dies is the same ending as pressing Log out.
 *
 * Both roads land on the login card, and only one of them used to tidy up: a
 * 401 dropped the session and left the records, the partner and the THEME
 * behind. The comment beside sign-out says the login page always renders
 * midnight; on the other road it did not, and rendered in the departed user's
 * colours instead.
 */
test('a revoked token lands on a login page that looks like the login page', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `exp${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // Sage, so "still wearing the last user's colours" is visible rather than
  // theoretical — it is nearly white where midnight is nearly black.
  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('theme-sage').click();
  // Bounded: a click() on a control that is not there does not fail fast, it
  // waits out the whole test budget and reads as a hang. Settings may close on
  // its backdrop rather than a Done, and either is fine here.
  await page.getByText('Done', { exact: true }).click({ timeout: 1_500 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
    .toBe('rgb(254, 250, 224)');

  // Kill the token the way the server would: every later call answers 401.
  await page.route('**/api/index.php', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'bad token' }) }));
  await page.evaluate(() => window.localStorage.removeItem('calmind.tab'));
  await page.getByTestId('tab-notes').click();

  await expect(page.getByPlaceholder('Username'), 'the session is gone').toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), { timeout: 15_000 })
    .toBe('rgb(17, 17, 17)');
});
