import { expect, test, type Page } from '@playwright/test';

/**
 * "Undo last delete" in the username's dropdown.
 *
 * Sean, 2026-08-11: it "undoes the last delete of any reminder, event, note,
 * or habit". Nothing new is remembered to do it — a delete here is a
 * tombstone, so the newest tombstone already IS the last delete, which is why
 * it survives a reload and reads the same on every device.
 *
 * undo.test.ts covers which record is chosen. What only a browser answers is
 * whether the menu entry is wired to it, whether the row actually comes back
 * on screen, and what happens when there is nothing to undo.
 */
async function signup(page: Page): Promise<string> {
  const user = `ud${String(Date.now()).slice(-7)}`;
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

/** Notes, because their delete is two clean presses inside the editor —
 *  a reminder's lives behind a long-press with no testID, and this spec is
 *  about the undo, not about reaching a delete button. */
async function addNote(page: Page, title: string) {
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill(title);
  await page.getByTestId('note-back').click();
  await expect(page.getByTestId('note-row').filter({ hasText: title })).toHaveCount(1);
}

async function deleteNote(page: Page, title: string) {
  await page.getByTestId('note-row').filter({ hasText: title }).first().click();
  // Two-press delete: the first arms, the second fires.
  await page.getByText('Delete', { exact: true }).click();
  await page.getByText('Delete', { exact: true }).click();
  await expect(page.getByTestId('note-row').filter({ hasText: title })).toHaveCount(0, { timeout: 10_000 });
}

async function undo(page: Page, user: string) {
  await page.getByText(user, { exact: true }).click();
  await page.getByTestId('undo-delete').click();
}

test('the last deleted note comes back, and it is the LAST one', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);
  await page.getByTestId('tab-notes').click();

  await addNote(page, 'first casualty');
  await addNote(page, 'second casualty');

  // Deleted oldest first, so "the last one" is unambiguous.
  await deleteNote(page, 'first casualty');
  await deleteNote(page, 'second casualty');

  await undo(page, user);
  await expect(
    page.getByTestId('note-row').filter({ hasText: 'second casualty' }),
    'the one deleted LAST is the one that comes back',
  ).toHaveCount(1, { timeout: 10_000 });
  await expect(
    page.getByTestId('note-row').filter({ hasText: 'first casualty' }),
    'the earlier one stays deleted',
  ).toHaveCount(0);

  // Undoing again walks back to the one before it.
  await undo(page, user);
  await expect(
    page.getByTestId('note-row').filter({ hasText: 'first casualty' }),
    'a second undo goes back further',
  ).toHaveCount(1, { timeout: 10_000 });
});

test('with nothing deleted it says so rather than doing something', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);
  await page.getByTestId('tab-notes').click();
  await addNote(page, 'still here');

  await undo(page, user);
  await expect(page.getByTestId('undo-note')).toHaveText('Nothing to undo');
  await expect(
    page.getByTestId('note-row').filter({ hasText: 'still here' }),
    'and it touched nothing',
  ).toHaveCount(1);
});
