/**
 * KNOWN BUG, kept visible rather than deleted or left red — the same way
 * twotab.spec.ts carries its own.
 *
 * Make a note, tap its title, start typing: the first keystroke is lost.
 * Type fast enough and the default title is still in the field and the
 * letters land inside it.
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
 * So the hazard is roughly the first 300ms of the field's life, and what it
 * costs is the first letter. That is a papercut people blame on themselves —
 * "I must have missed the key" — which is why it wants a test rather than a
 * memory.
 *
 * WHY NO SPEC SAW IT: every existing one sets a title with `fill()`, which
 * puts the whole value in through a single change event. Nothing in the suite
 * ever typed a title key by key. The body IS fine at the same speed, checked,
 * and so is an existing note's title — it is specific to a note that has just
 * been created and is still settling.
 *
 * NOT FIXED HERE, deliberately, and the cause is narrower than it looks.
 * SIX other fields were typed key by key at the same speed and are all
 * perfect: the reminder add field, the reminder inline edit, the recipe
 * editor's ingredient and step fields, "New section", and the item sheet's
 * What? field. So is the note BODY, in the control test below — and the body
 * writes through the same mutate → refresh → re-render on every keystroke.
 *
 * That rules out the per-keystroke write. What this field alone does is
 * selectTextOnFocus plus an imperative setSelection(0, len) in onFocus, and
 * the lost letter is a re-render landing between that selection and the first
 * key. Which way to fix it is a decision about behaviour Sean asked for —
 * tap the title and type over it — so TODO §2 carries it.
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
  test.fixme(true, 'the first keystroke is lost for ~300ms after the field opens — see TODO §2');

  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await expect(page.getByTestId('note-title')).toBeVisible();

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
