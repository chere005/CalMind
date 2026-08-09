import { expect, test, type Page } from '@playwright/test';

/**
 * The same account on TWO devices.
 *
 * Sean reads this on a phone, a desktop browser and a Tauri window, often
 * within the same hour — so two clients holding the same store and both
 * writing is his ordinary case, not a stress test. The sync engine's
 * last-writer-wins is unit-tested inside one process; two real clients
 * reconciling through the actual server had never been.
 *
 * The sharing specs run two contexts, but as two different PEOPLE. This is
 * one person, twice.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `two${Date.now()}${seq++}`;
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

async function signin(page: Page, user: string, url: string) {
  await page.goto(url);
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByText('Sign in', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

async function addReminder(page: Page, text: string) {
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
}

test('two devices on one account: both sets of edits survive, and a tick crosses over', async ({ page, context }) => {
  test.setTimeout(90_000);
  const user = await signup(page);
  const url = page.url().split('?')[0]!;
  await page.getByTestId('tab-reminders').click();
  await addReminder(page, 'from the phone');
  // Let the push land before the other device pulls. The store debounces the
  // network round-trip by 800ms and otherwise polls every 30s, so two clients
  // converge on a load or within half a minute — NOT instantly. That is a
  // characteristic worth knowing rather than a race to paper over, and it is
  // why this spec reloads to converge instead of waiting on the interval.
  await page.waitForTimeout(2_000);

  // The second device, signing in fresh — its own storage, its own session.
  const second = await context.browser()!.newContext();
  const desk = await second.newPage();
  await signin(desk, user, url);
  await desk.getByTestId('tab-reminders').click();
  await expect(desk.getByTestId('rem-row').filter({ hasText: 'from the phone' })).toBeVisible({ timeout: 20_000 });

  // Each device writes something the other has never seen.
  await addReminder(desk, 'from the desktop');
  await addReminder(page, 'phone again');
  // Both pushes need to land before either device pulls, for the same reason
  // as above: the round-trip is debounced, so "reload immediately" reads the
  // server before it has been told.
  await page.waitForTimeout(2_000);

  // Both catch up, and NOTHING is lost in either direction — the failure this
  // is looking for is one device's write quietly replacing the other's.
  for (const p of [page, desk]) {
    await p.reload();
    await p.getByTestId('tab-reminders').click();
    for (const text of ['from the phone', 'from the desktop', 'phone again']) {
      await expect(p.getByTestId('rem-row').filter({ hasText: text }), `${text} survived`).toBeVisible({ timeout: 20_000 });
    }
  }

  // And a tick on one device is a tick on the other: completed rows hide, so
  // the row leaving the desktop's list is the edit arriving.
  await page.getByTestId('rem-row').filter({ hasText: 'from the desktop' }).getByTestId('tick').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'from the desktop' })).toBeHidden();
  await page.waitForTimeout(2_000); // the tick has to reach the server first
  await desk.reload();
  await desk.getByTestId('tab-reminders').click();
  await expect(desk.getByTestId('rem-row').filter({ hasText: 'from the desktop' })).toBeHidden({ timeout: 20_000 });
  await expect(desk.getByTestId('rem-row').filter({ hasText: 'from the phone' })).toBeVisible();

  await second.close();
});
