import { expect, test, type Page } from '@playwright/test';

/**
 * TWO TABS, not two devices.
 *
 * twodevice.spec deliberately opens a second BROWSER CONTEXT — "its own
 * storage, its own session" — so it tests two machines. Two tabs of one
 * browser are a different animal: they share the localStorage snapshot, and
 * each holds its own SyncEngine in memory and writes the whole snapshot over
 * that one key on every mutate. There is no `storage` listener and no
 * BroadcastChannel; neither tab knows the other exists.
 *
 * Online that is harmless — the server is the meeting point and the snapshot
 * is only a cache. This asks the question that matters: OFFLINE, where the
 * snapshot is the only copy there is.
 */
async function signup(page: Page): Promise<string> {
  const user = `tt${String(Date.now()).slice(-7)}`;
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

async function addReminder(page: Page, text: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  const f = page.getByTestId('rem-add-field');
  await f.fill(text);
  await f.press('Enter');
  await expect(page.getByText(text)).toBeVisible();
}

test('two offline tabs do not overwrite each other in the snapshot', async ({ page, context }) => {
  // A fixme from 2026-08-11 to 2026-08-19, when Sean said to get it done.
  // The fix is the first option the TODO entry listed: a `storage` listener
  // (store.tsx) folding the other tab's snapshot through core's own LWW
  // (SyncEngine.mergeSnapshot, driven in twotabmerge.test.ts) — each tab
  // persists the UNION when the merge changed anything, so whichever tab's
  // snapshot a reload reads, both tabs' work is in it.
  test.setTimeout(120_000);
  await signup(page);
  const url = page.url().split('?')[0]!;

  const tabB = await context.newPage();      // SAME context: one localStorage
  await tabB.goto(url);
  await expect(tabB.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await addReminder(page, 'written in tab A');
  await addReminder(tabB, 'written in tab B');
  await page.waitForTimeout(1_500);

  // Still offline, so the server cannot rescue either of them: whatever is in
  // the snapshot IS the whole of what survives a reload.
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-reminders').click();

  await expect(page.getByText('written in tab B'), "tab B's row survived").toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('written in tab A'), "tab A's row survived too").toBeVisible({ timeout: 10_000 });
});
