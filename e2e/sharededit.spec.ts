import { expect, test, type Page } from '@playwright/test';

/**
 * A partner's shared rows can be EDITED and ADDED TO, and the writes land in
 * THEIR store.
 *
 * Sean, 2026-09-15: "allow users to modify and add events/reminders/notes to
 * shared events/reminders/notes." Before this the shared views offered a tick
 * and (for reminders) a bare add field; a partner's row could not be reworded
 * or re-dated, and the item sheet knew only my own containers.
 *
 * Both halves are asserted on the OWNER's page, which is the only place that
 * separates "B saw its own edit" from "the edit reached A". A build that saved
 * the sheet through my engine would show B the new words and give A nothing —
 * or worse, plant a copy of A's row in B's store.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `se${Date.now()}${seq++}`;
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

/** A shares a Reminders folder holding `row` with B, and leaves B looking at it. */
async function share(pageA: Page, pageB: Page, row: string) {
  const userB = await signup(pageB);
  const userA = await signup(pageA);

  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('rem-add-field').fill(row);
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
  await expect(pageB.getByText(row)).toBeVisible({ timeout: 15_000 });
  return { userA, userB };
}

test("a partner's row is reworded in the sheet, and the owner sees the new words", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await share(pageA, pageB, 'collect the parcel');

  // B taps the words: the item sheet opens on A's row and says so.
  await pageB.getByTestId('shared-row').first().click();
  await expect(pageB.getByTestId('item-shared-note'), 'the sheet says it saves to the partner').toBeVisible();
  await pageB.getByPlaceholder(/What\?/).fill('collect the BIG parcel');
  await pageB.getByText('Save', { exact: true }).click();
  await expect(pageB.getByText('collect the BIG parcel')).toBeVisible({ timeout: 15_000 });

  // The owner: the row IS reworded, and there is still exactly one of it.
  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('topbar-sync').click();
  await expect(pageA.getByText('collect the BIG parcel')).toBeVisible({ timeout: 20_000 });
  await expect(pageA.getByText('collect the parcel', { exact: true })).toHaveCount(0);

  // B's own store gained nothing: back on B's All view the row is drawn only
  // under A's block.
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-all').click();
  await expect(pageB.getByTestId('all-shared-row').filter({ hasText: 'collect the BIG parcel' })).toHaveCount(1);
  await expect(pageB.getByTestId('rem-row').filter({ hasText: 'collect the BIG parcel' })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

test("the + on a partner's section files a new row in THEIR list", async ({ browser }) => {
  test.setTimeout(150_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await share(pageA, pageB, 'collect the parcel');

  // From the All view's shared block: + opens the sheet already filed there.
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-all').click();
  await pageB.getByTestId('shared-secadd-General').click();
  await expect(pageB.getByTestId('item-shared-note')).toBeVisible();
  await pageB.getByPlaceholder(/What\?/).fill('buy stamps');
  await pageB.getByText('Save', { exact: true }).click();
  await expect(pageB.getByTestId('all-shared-row').filter({ hasText: 'buy stamps' })).toBeVisible({ timeout: 15_000 });
  // …and not in B's own General.
  await expect(pageB.getByTestId('rem-row').filter({ hasText: 'buy stamps' })).toHaveCount(0);

  // The owner has it.
  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('topbar-sync').click();
  await expect(pageA.getByText('buy stamps')).toBeVisible({ timeout: 20_000 });

  await ctxA.close();
  await ctxB.close();
});
