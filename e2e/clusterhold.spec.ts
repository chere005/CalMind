/**
 * A row's cluster button works while you are TYPING in that row.
 *
 * Editing a reminder inline puts a focused field where the text was, and the
 * row's cluster — pencil, duplicate, +, ‹, × — sits beside it. Pressing one
 * of those blurs the field first, and Reminders.tsx has a guard for exactly
 * that:
 *
 *     onBlur={() => {
 *       saveEdit(r);
 *       // A pointer already down on a cluster button: keep the cluster
 *       // mounted so its press can land (blur fires between pointerdown and
 *       // click, and unmounting kills the tap).
 *       if (holdCluster.current) { holdCluster.current = false; return; }
 *       ...
 *       setEditing(null);
 *     }}
 *
 * Without it, blur runs `setEditing(null)`, the row leaves edit mode, the
 * cluster unmounts BETWEEN the pointerdown and the click, and the press is
 * swallowed. The button does nothing and there is nothing to see.
 *
 * Found 2026-08-12 by mutation: deleting that early return left all 181
 * gesture tests green. Every existing spec presses a cluster button from a
 * row that is NOT being edited, which is the case the guard does not govern.
 *
 * So each test here types first and presses second. The empty-text case is
 * included because the same early return is what stops a blur from DELETING
 * the row you are editing — press + on a blank new row and the guard is all
 * that keeps it alive long enough for the subtask to be added.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ch${Date.now()}${seq++}`;
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

async function addReminder(page: Page, text: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: text })).toBeVisible();
}

/** Long-press the row body: pageEdit on, this row inline-editing, field focused. */
async function editInline(page: Page, text: string) {
  const body = page.getByTestId('rem-body').filter({ hasText: text });
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit'), 'the row is now an open field').toBeVisible();
}

test('duplicate works while the row is being typed in', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'buy bread');
  await editInline(page, 'buy bread');

  // The press that has to survive its own blur.
  await page.getByTestId('rem-dup').first().click();

  await expect
    .poll(async () => page.getByTestId('rem-row').filter({ hasText: 'buy bread' }).count(),
      { message: 'the duplicate landed even though the field blurred first', timeout: 10_000 })
    .toBe(2);
});

test('an edit in progress is SAVED by that same press, not lost', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'buy bread');
  await editInline(page, 'buy bread');

  // Change the text, then press the cluster without pressing Enter. saveEdit
  // runs from the blur, so the new text must be what gets duplicated — losing
  // it would be the same bug wearing different clothes.
  await page.getByTestId('rem-edit').fill('buy sourdough');
  await page.getByTestId('rem-dup').first().click();

  await expect
    .poll(async () => page.getByTestId('rem-row').filter({ hasText: 'buy sourdough' }).count(),
      { message: 'the typed text was saved and then duplicated', timeout: 10_000 })
    .toBe(2);
  await expect(page.getByTestId('rem-row').filter({ hasText: 'buy bread' }), 'the old text is gone')
    .toHaveCount(0);
});

test('outdenting a subtask you have just retyped keeps the new text', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'buy bread');

  // A subtask, so the ‹ button exists at all.
  await editInline(page, 'buy bread');
  // The cluster's + carries an accessibility label and no testID; the
  // section's + has both, so exclude the ones that do or the section add wins.
  await page.locator('[aria-label="Add"]:not([data-testid])').first().click();
  const sub = page.getByTestId('rem-edit');
  await expect(sub).toBeVisible();
  await sub.fill('and jam');
  await sub.press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: 'and jam' })).toBeVisible();

  // Retype it, then outdent WITHOUT pressing Enter. outdent used to write the
  // record this render was holding — the pre-edit payload — straight back
  // over the save, so the retype vanished. Worse than the duplicate bug: that
  // one made a wrong copy, this one destroyed the edit.
  await editInline(page, 'and jam');
  await page.getByTestId('rem-edit').fill('and marmalade');
  await page.locator('[aria-label="Previous"]:not([data-testid])').first().click();

  await expect
    .poll(async () => page.getByTestId('rem-body').allTextContents(),
      { message: 'the retype survived the outdent', timeout: 10_000 })
    .toEqual(expect.arrayContaining(['and marmalade']));
  await expect(page.getByTestId('rem-row').filter({ hasText: 'and jam' }), 'the old text is gone')
    .toHaveCount(0);
});
