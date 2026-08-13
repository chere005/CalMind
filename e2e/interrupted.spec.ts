import { expect, test, type Page } from '@playwright/test';

/**
 * Being interrupted mid-edit.
 *
 * Every spec finishes what it starts — types, presses Enter, moves on. A
 * phone doesn't work like that: you rename something, a message arrives, you
 * switch away, you come back. Whether the change survives depends on when the
 * text reaches the store, which is exactly the kind of thing nobody can answer
 * by reading.
 *
 * THE REMINDER HALF OF THIS FILE IS GONE, and not because it stopped mattering:
 * the thing it described stopped existing. Sean removed inline name editing
 * from the Reminders screen on 2026-08-12, so there is no row holding text in
 * local state and writing it on blur, and no question about whether blur fires
 * when the tab changes under it. A name is edited in the item window now, which
 * writes on Save and on nothing else — so an abandoned edit is DISCARDED, and
 * that is the modal's contract rather than a loss. A test asserting the old
 * survival would now be asserting a bug.
 *
 * The note body is the interesting case that remains, and it is the opposite
 * design: it writes on every keystroke, so it should be safe by construction.
 * Worth holding precisely because a later "optimisation" to debounce it would
 * quietly break exactly this.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `int${Date.now()}${seq++}`;
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

test('a note body survives being interrupted mid-sentence, even across a reload', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('shopping');
  await page.getByTestId('note-body-edit').fill('half a sentence that stops mid');

  await page.getByTestId('tab-habits').click();
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'shopping' }).click();
  await expect(page.getByTestId('note-body-view'), 'the half sentence is still there')
    .toContainText('half a sentence that stops mid', { timeout: 10_000 });
});
