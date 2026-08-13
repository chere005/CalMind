import { expect, test, type Page } from '@playwright/test';

/**
 * A write into a partner's store that the server refuses.
 *
 * Every caller of sharedPut fires and forgets it (`void sharedPut(...)`), so
 * a rejection had nowhere to go but an unhandled promise. And it rejects for
 * an entirely ordinary reason: sharing ending a moment before you tap. What
 * that looked like was a tick that did nothing, said nothing, and logged
 * somewhere nobody will look — the row sitting there swallowing taps.
 *
 * The refusal is forced rather than raced for — the server answers 403 when
 * sharing has ended, so the test makes it answer 403. Same code path, no
 * timing to lose.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `sf${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a tick on a row the partner just un-shared fails quietly and honestly', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const userB = await signup(pageB);
  const userA = await signup(pageA);

  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('rem-add-field').fill('peel garlic');
  await pageA.getByTestId('rem-add-field').press('Enter');
  await pageA.getByTestId('topbar-sync').click();
  await pageA.getByText('Settings', { exact: true }).click();
  await pageA.getByTestId('open-share').click();
  await pageA.getByTestId('share-add-partner').fill(userB);
  await pageA.getByTestId('share-add-partner').press('Enter');
  await pageA.getByTestId('share-folders-Reminders').click();
  await pageA.getByText('Done', { exact: true }).click();

  await pageB.getByTestId('topbar-sync').click();
  await pageB.getByText('Settings', { exact: true }).click();
  await pageB.getByTestId('open-share').click();
  await pageB.getByTestId('share-add-partner').fill(userA);
  await pageB.getByTestId('share-add-partner').press('Enter');
  await expect(pageB.getByText('sharing', { exact: true })).toBeVisible({ timeout: 10_000 });
  await pageB.getByText('Done', { exact: true }).click();

  await pageB.getByTestId('tab-reminders').click();
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-shared-Reminders').click();
  await expect(pageB.getByText('peel garlic')).toBeVisible({ timeout: 10_000 });

  // Force the exact refusal rather than racing for it: the server answers 403
  // when sharing has ended, so make it answer 403. Same code path, no timing.
  const errors: string[] = [];
  pageB.on('pageerror', (e) => errors.push(e.message));
  await pageB.addInitScript(() => {
    (window as unknown as { __rej: string[] }).__rej = [];
    window.addEventListener('unhandledrejection', (e) => {
      (window as unknown as { __rej: string[] }).__rej.push(String(e.reason));
    });
  });
  await pageB.reload();
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-shared-Reminders').click();
  await expect(pageB.getByText('peel garlic')).toBeVisible({ timeout: 10_000 });
  await pageB.route('**/api/index.php*', async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('"shared_put"')) {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"not shared"}' });
      return;
    }
    await route.continue();
  });

  await pageB.getByTestId('shared-tick').first().click();
  await pageB.waitForTimeout(2_000);

  // Nothing thrown at the page, and the app is still alive and usable.
  expect(errors, 'a refused shared write is not a page error').toEqual([]);
  const rejections = await pageB.evaluate(() => (window as unknown as { __rej?: string[] }).__rej ?? []);
  expect(rejections, 'nor an unhandled rejection').toEqual([]);
  await pageB.getByTestId('tab-calendar').click();
  await expect(pageB.getByTestId('cal-grid')).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
