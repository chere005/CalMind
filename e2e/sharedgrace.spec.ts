import { expect, test, type Page } from '@playwright/test';

/**
 * The same two seconds, on a PARTNER's row.
 *
 * Sean asked for the grace "in all apps". Three surfaces tick a partner's
 * reminder — Reminders' All view, the shared folder view, Calendar's day panel
 * — and none of them had it while every owned list did. That is the case where
 * it matters most: the row is not mine to go hunting for in Completed, and the
 * partner sees the change.
 *
 * The second test is the one worth having. A shared tick is a POST followed by
 * a re-pull, not a local write, so for a moment the record on screen still
 * says `done: false`. An implementation that simply toggled again from what it
 * could see would send done a SECOND time and leave the partner's reminder
 * finished — a mis-tap "corrected" into the exact thing it was correcting. So
 * the assertion is made on the OWNER's page, which is the only place that can
 * tell the two implementations apart.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `sg${Date.now()}${seq++}`;
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

/**
 * A shares a Reminders folder with B, holding one row, and leaves B looking at
 * it. Returns both usernames.
 */
async function share(pageA: Page, pageB: Page, row: string) {
  const userB = await signup(pageB);
  const userA = await signup(pageA);

  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('rem-add-field').fill(row);
  await pageA.getByTestId('rem-add-field').press('Enter');
  await pageA.getByText(userA, { exact: true }).click();
  await pageA.getByText('Settings', { exact: true }).click();
  await pageA.getByTestId('open-share').click();
  await pageA.getByTestId('share-add-partner').fill(userB);
  await pageA.getByTestId('share-add-partner').press('Enter');
  await pageA.getByTestId('share-folders-Reminders').click();
  await pageA.getByText('Done', { exact: true }).click();

  await pageB.getByText(userB, { exact: true }).click();
  await pageB.getByText('Settings', { exact: true }).click();
  await pageB.getByTestId('open-share').click();
  await pageB.getByTestId('share-add-partner').fill(userA);
  await pageB.getByTestId('share-add-partner').press('Enter');
  await expect(pageB.getByText('sharing', { exact: true })).toBeVisible({ timeout: 10_000 });
  await pageB.getByText('Done', { exact: true }).click();

  await pageB.getByTestId('tab-reminders').click();
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-shared-Reminders').click();
  await expect(pageB.getByText(row)).toBeVisible({ timeout: 15_000 });
  return { userA, userB };
}

test("a partner's ticked row lingers, then goes", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await share(pageA, pageB, 'collect the parcel');

  await pageB.getByTestId('shared-tick').first().click();

  // Ticked at once — drawn from the tap, not from the round trip coming back.
  await expect(pageB.getByTestId('shared-tick').first().getByText('✓'), 'it shows ticked immediately').toBeVisible();
  await expect(pageB.getByText('collect the parcel'), 'and the row holds its place').toBeVisible();

  // The half that makes the first half mean something: it does end.
  await expect(pageB.getByText('collect the parcel'), 'the row leaves when the grace expires').toHaveCount(0, {
    timeout: 10_000,
  });

  await ctxA.close();
  await ctxB.close();
});

test("tapping a partner's row again in the grace really un-ticks it for them", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await share(pageA, pageB, 'book the ferry');

  // HOLD THE RE-PULL OPEN. Written first without this, and it passed with the
  // bug in place: a loopback server answers so fast that the record is already
  // back and correct before a second tap can be made, so the window this test
  // exists for never opened. Delaying shared_pull inside the grace makes the
  // stale window a fact rather than something to hope for — sharedfail.spec's
  // lesson, which forces its 403 rather than racing for it.
  await pageB.route('**/api/index.php*', async (route) => {
    if ((route.request().postData() ?? '').includes('"shared_pull"')) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
    await route.continue();
  });

  await pageB.getByTestId('shared-tick').first().click();
  await expect(pageB.getByTestId('shared-tick').first().getByText('✓')).toBeVisible();

  // Now, with the write's re-pull still in flight and the record on screen
  // still saying it is not done.
  await pageB.getByTestId('shared-tick').first().click();
  await expect(pageB.getByTestId('shared-tick').first().getByText('✓'), 'the tick comes off').toHaveCount(0);
  await pageB.waitForTimeout(3_000);
  await expect(pageB.getByText('book the ferry'), 'and it stays, being no longer done').toBeVisible();

  // And the owner's copy, which is what the whole thing is for. Held the
  // second write to `done` and both of these go red — the row above vanishes
  // from B once the delayed pull lands, and this one never comes back.
  await pageA.getByTestId('tab-reminders').click();
  await pageA.reload();
  await expect(pageA.getByText('book the ferry'), "the owner's row is undone, not finished").toBeVisible({
    timeout: 20_000,
  });

  await ctxA.close();
  await ctxB.close();
});
