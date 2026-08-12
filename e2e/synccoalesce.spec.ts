import { expect, test, type Page } from '@playwright/test';

/**
 * An edit made DURING a slow sync still goes out promptly.
 *
 * The in-flight guard that stops a stalled sync stacking another every thirty
 * seconds has a cost if it merely drops the request: a running sync carries
 * only what was dirty when it STARTED, so an edit made while it is in flight
 * is not in it, and its own debounced push is thrown away. The next chance is
 * the thirty-second poll — on a slow link, half a minute of a reminder living
 * on one device while the app says nothing is wrong.
 *
 * So the request is remembered and one more pass runs when the current one
 * finishes. This asserts the SECOND sync happens, within seconds rather than
 * within the poll.
 */
async function signup(page: Page): Promise<string> {
  const user = `sc${String(Date.now()).slice(-7)}`;
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

test('an edit during a slow sync is not left waiting for the poll', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);

  // Every sync takes two seconds — long enough that the debounced push for an
  // edit made during one lands while it is still in flight.
  let syncs = 0;
  await page.route('**/api/index.php*', async (route) => {
    if ((route.request().postData() ?? '').includes('"sync"')) {
      syncs += 1;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    await route.continue();
  });

  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('first');
  await page.getByTestId('rem-add-field').press('Enter');

  // Wait for that sync to be under way, then edit again on top of it.
  await page.waitForTimeout(1_200);
  const before = syncs;
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('second, mid-flight');
  await page.getByTestId('rem-add-field').press('Enter');

  // Well short of the 30s poll: anything that happens here is the coalesced
  // pass, not the interval.
  await page.waitForTimeout(9_000);
  expect(
    syncs,
    `no sync followed the mid-flight edit (${before} before, ${syncs} after) — it is waiting for the poll`,
  ).toBeGreaterThan(before);
});
