import { expect, test } from '@playwright/test';

/**
 * What the phone's own bars are painted from.
 *
 * With viewport-fit=cover the page shows through both safe areas, and iOS
 * tints browser chrome from <meta name="theme-color">. Both were being left
 * to a colour hardcoded into the HTML at export time — correct for Midnight
 * by coincidence, and wrong for every other theme. Sage is nearly white, so
 * on Sage that constant is the whole bug in miniature.
 */
test('theme-color and the page background follow the chosen theme, across a reload', async ({ page }) => {
  test.setTimeout(60_000);
  const user = `thm${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('topbar-sync').click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('theme-sage').click();

  const chrome = () => page.evaluate(() => ({
    meta: (document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null)?.content ?? '',
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  const now = await chrome();
  expect(now.meta.toLowerCase(), 'the bars are told the theme colour').toBe('#fefae0');
  expect(now.html, 'and the page under the safe areas matches').toBe('rgb(254, 250, 224)');
  expect(now.body).toBe('rgb(254, 250, 224)');

  // The reload is the point: on a plain load the theme is already current, and
  // the early return meant nothing wrote the chrome at all.
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  const after = await chrome();
  expect(after.meta.toLowerCase(), 'still right after a reload').toBe('#fefae0');
  expect(after.html).toBe('rgb(254, 250, 224)');
});
