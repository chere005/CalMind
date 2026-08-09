import { expect, test, type Page } from '@playwright/test';

/**
 * Something deleted while you are standing on it.
 *
 * Sean reads this on three clients. Deleting a note on the phone while it is
 * open on the desktop is an ordinary Tuesday, not a stress test — and the
 * editor holds its record by looking it up on every render, so the moment the
 * delete syncs in, that lookup returns nothing. Whether that is a graceful
 * fall back to the list or a blank screen with no way out is not something
 * reading the code answers with confidence.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `del${Date.now()}${seq++}`;
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

test('a note deleted on another device leaves its editor gracefully, not blank', async ({ page, context }) => {
  test.setTimeout(90_000);
  const user = await signup(page);
  const url = page.url().split('?')[0]!;

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('doomed');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByText('← All notes').click();
  await page.waitForTimeout(2_000); // let the push land

  // The other device deletes it.
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(url);
  await p2.getByPlaceholder('Username').fill(user);
  await p2.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await p2.getByText('Sign in', { exact: true }).click();
  await expect(p2.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await p2.getByTestId('tab-notes').click();
  const row = p2.getByTestId('note-row').filter({ hasText: 'doomed' });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // Delete it from inside its own editor — two presses, as everywhere.
  await row.click();
  await expect(p2.getByTestId('note-body-view')).toBeVisible();
  const del = p2.getByText('Delete', { exact: true });
  await del.click();
  await del.click();
  await expect(p2.getByTestId('note-row').filter({ hasText: 'doomed' })).toHaveCount(0, { timeout: 10_000 });
  await p2.waitForTimeout(2_000);

  // Meanwhile this device is standing inside that note.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.getByTestId('note-row').filter({ hasText: 'doomed' }).click();
  await expect(page.getByTestId('note-body-view')).toBeVisible();

  // The delete arrives. The editor's record vanishes under it.
  await page.reload();
  await page.getByTestId('tab-notes').click();

  // Not a crash, and not a dead end: the list is there and still works.
  expect(errors, 'nothing threw when the record went away').toEqual([]);
  await expect(page.getByTestId('note-row').filter({ hasText: 'doomed' })).toHaveCount(0, { timeout: 20_000 });
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('still usable');
  await page.getByPlaceholder('New note').press('Enter');
  // Creation lands in the editor TYPING now, so the live edit field is the
  // proof the screen still works.
  await expect(page.getByTestId('note-body-edit')).toBeVisible();

  await other.close();
});
