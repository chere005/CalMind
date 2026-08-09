import { expect, test } from '@playwright/test';

/**
 * One note's words must never appear in another note's editor.
 *
 * The body and title hold a local draft while they have the cursor, so that an
 * incoming sync cannot replace text mid-sentence. That draft belongs to the
 * note that was open. Left in place when a different note is opened, it does
 * exactly what it was built to prevent: the previous note's text is shown as
 * this one's, and the first keystroke writes it over the real thing.
 *
 * Found on a phone, in Sean's own recipes — "Pasta alla Zozzona" showing the
 * body of "Pasta Aglio, Olio e Peperoncino", one keypress from replacing it.
 *
 * READ THIS BEFORE TRUSTING IT. This spec passes with the fix and WITHOUT it,
 * measured both ways. On the web, clicking "← All notes" blurs the field, and
 * the blur handler clears the draft — so the browser never reaches the state
 * that broke. On iOS a tap elsewhere does not blur a TextInput, the draft
 * survives, and the next note opens wearing it. The fix (clearing the drafts
 * when openId changes) was verified by hand on the simulator, which is where
 * the bug lives.
 *
 * So what this file guards is the OTHER path: if the blur handler ever stops
 * clearing the draft, the web breaks the same way and this catches it. That
 * is worth having, and it is not the same thing as covering the reported bug.
 *
 * The shared-note view carries the identical state and now the identical
 * reset. It is worse there and gets no spec for the same reason: that screen
 * commits on BLUR rather than on a keystroke, so a leftover draft would be
 * written into the next note by tapping away — a partner's note, overwritten,
 * with nobody having typed a character.
 */
test('opening a second note never shows the first one’s text', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `sw${Date.now()}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();

  for (const [title, body] of [['Alpha', 'the first recipe'], ['Beta', 'the second recipe']]) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByPlaceholder('New note').fill(title!);
    await page.getByPlaceholder('New note').press('Enter');
    await page.getByTestId('note-body-edit').fill(body!);
    await page.getByText('← All notes').click();
  }

  // Open Alpha and put the cursor in its body — that is what arms the draft.
  await page.getByTestId('note-row').filter({ hasText: 'Alpha' }).click();
  await page.getByTestId('note-body-view').click();
  await expect(page.getByTestId('note-body-edit')).toHaveValue('the first recipe');
  await page.getByText('← All notes').click();

  // Now Beta. It must be Beta's own words, and not already in an editor.
  await page.getByTestId('note-row').filter({ hasText: 'Beta' }).click();
  await expect(page.getByTestId('note-body-edit'), 'the editor does not carry over').toHaveCount(0);
  await expect(page.getByTestId('note-body-view')).toContainText('the second recipe');
  await expect(page.getByTestId('note-body-view')).not.toContainText('the first recipe');

  // And the record itself is untouched — a stale draft would have saved on the
  // first keystroke, so type one and check what landed.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').press('End');
  await page.getByTestId('note-body-edit').type('!');
  await page.getByText('← All notes').click();
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'Beta' }).click();
  await expect(page.getByTestId('note-body-view')).toContainText('the second recipe!');
  await expect(page.getByTestId('note-body-view')).not.toContainText('first');
});
