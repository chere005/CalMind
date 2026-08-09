import { expect, test } from '@playwright/test';

/**
 * A device that cannot write its own copy.
 *
 * The local snapshot is what survives a reload. Its write used to be
 * `.catch(() => {})` — swallowed whole — which is the quietest kind of loss
 * there is: everything keeps working, the app says "Online — synced", and
 * then a reload comes back to yesterday. Storage refuses for ordinary
 * reasons: a full quota, a browser clearing site data for a page it thinks is
 * idle.
 */
test('a device that cannot save its copy says so instead of looking fine', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `ns${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // Make the snapshot write fail the way a full quota does. Only the snapshot:
  // the session key must keep working, or this tests being logged out instead.
  await page.evaluate(() => {
    const real = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k: string, v: string) => {
      if (k.startsWith('calmind.snapshot.')) throw new Error('QuotaExceededError');
      real(k, v);
    };
  });

  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('milk');
  await page.getByTestId('rem-add-field').press('Enter');

  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await expect(
    page.getByText(/cannot save its copy/),
    'it says so rather than claiming to be synced',
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Online — synced')).toHaveCount(0);
});
