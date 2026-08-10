import { expect, test } from '@playwright/test';

/**
 * An armed delete belongs to the note it was armed on.
 *
 * The note editor's Delete is two-press: the first arms it, the second does
 * it, and it disarms itself after 2.5 seconds. The arming lived in screen
 * state rather than in anything tied to the note — so arming on one note and
 * opening another inside that window turned the second note's two-press
 * delete into a ONE-press delete, on a note nobody had confirmed anything
 * about. Four taps is a comfortable 2.5 seconds.
 *
 * Unlike the stale-draft bug next door, this one reproduces in a browser,
 * so this spec has teeth: it fails without the fix.
 */
test('arming delete on one note does not prime it on the next', async ({ page }) => {
  test.setTimeout(60_000);
  const user = `arm${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();

  for (const title of ['Keep me', 'Also keep me']) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('note-title').fill(title);
    await page.getByTestId('note-back').click();
  }

  // Arm the delete on the first note, then think better of it and leave.
  await page.getByTestId('note-row').filter({ hasText: 'Keep me' }).first().click();
  await page.getByText('Delete', { exact: true }).click();
  await page.getByTestId('note-back').click();

  // Open the other note and press Delete ONCE. That is an arming press.
  await page.getByTestId('note-row').filter({ hasText: 'Also keep me' }).click();
  await page.getByText('Delete', { exact: true }).click();
  await page.getByTestId('note-back').click();

  await expect(
    page.getByTestId('note-row').filter({ hasText: 'Also keep me' }),
    'one press on a fresh note deletes nothing',
  ).toHaveCount(1);
  await expect(page.getByTestId('note-row').filter({ hasText: 'Keep me' })).toHaveCount(2);
});
