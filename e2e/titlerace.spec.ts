/**
 * Make a note, tap its title, start typing: the first keystroke was lost.
 *
 * MEASURED 2026-08-12, clicking the title of a brand-new note and then typing
 * "Pancakes" at 80ms a key — a slow, deliberate speed:
 *
 *   wait   0ms after the click -> "Aug 12, 2026 aPt"
 *   wait  50ms                 -> "ancakes"
 *   wait 100ms                 -> "ancakes"
 *   wait 200ms                 -> "ancakes"
 *   wait 400ms                 -> "Pancakes"
 *
 * A papercut people blame on themselves — "I must have missed the key" —
 * which is why it wanted a test rather than a memory.
 *
 * WHY NO SPEC SAW IT: every existing one sets a title with `fill()`, a single
 * change event for the whole value. Nothing in the suite had ever typed a
 * title key by key. The body is fine at the same speed (the control test
 * below), and so are six other fields — the reminder add field, the reminder
 * inline edit, the recipe editor's ingredient and step fields, "New section",
 * and the item sheet's What? field — which ruled out the per-keystroke write
 * that was the first suspect.
 *
 * THE CAUSE was the title's select-all, and it is worth the detail because
 * two plausible fixes failed first. A click places its own caret AFTER
 * onFocus runs, so the selection made there is overwritten — and then
 * re-applied one keystroke late. Traced key by key:
 *
 *   after click  "Aug 12, 2026 at 10:17am"  sel 14-14
 *   after 'P'    "Aug 12, 2026 aPt 10:17am" sel 0-24
 *   after 'a'    "a"
 *
 * The P lands mid-title, the belated select-all covers everything, the next
 * key replaces the lot. Selecting a frame later fixed the 50ms case and still
 * lost the zero-gap one; hanging it off onSelectionChange did nothing at all,
 * because a plain caret placement fires no `select` event. RNW's own
 * selectTextOnFocus also fires late, with no handle to cancel.
 *
 * So the fix stopped racing and removed the thing being raced: a title nobody
 * has written is a PLACEHOLDER. The record still holds the generated title so
 * the list is not blank, the field is empty, and typing over it is just
 * typing — no selection, no ordering, nothing to lose a letter to.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `tr${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a new note keeps every letter of a title typed into it', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await expect(page.getByTestId('note-title')).toBeVisible();
  // Creating a note puts the caret in the BODY 50ms later, deliberately, and
  // that is the app's own signal that creation has settled. Waiting for it is
  // what a hand does anyway — nobody reaches the title inside 50ms — and
  // without it this spec and app.spec's "lands in the editor TYPING" fight
  // over the same window from opposite sides, one of them always losing.
  await expect(page.getByTestId('note-body-edit')).toBeFocused();

  await page.getByTestId('note-title').click();
  await page.getByTestId('note-title').pressSequentially('Pancakes', { delay: 80 });

  await expect
    .poll(() => page.getByTestId('note-title').inputValue(), { timeout: 5_000 })
    .toBe('Pancakes');
});

test('the note BODY does keep every letter, at the same speed', async ({ page }) => {
  // The control case, and the reason the entry above can be specific about
  // what is wrong: the body writes through the same mutate on every keystroke
  // and types perfectly. Whatever the title is fighting, it is not that.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-body-edit').click();
  await page.getByTestId('note-body-edit').pressSequentially('2 cups flour', { delay: 80 });

  await expect
    .poll(() => page.getByTestId('note-body-edit').inputValue(), { timeout: 5_000 })
    .toBe('2 cups flour');
});
