/**
 * The + and the ‹ on a reminder row: a subtask is made, named, and lifted out.
 *
 * THIS FILE REPLACES clusterhold.spec.ts, and the reason is worth writing down
 * because it is a whole mechanism retiring. That spec existed for one guard:
 *
 *     onBlur={() => {
 *       saveEdit(r);
 *       if (holdCluster.current) { holdCluster.current = false; return; }
 *       ...
 *       setEditing(null);
 *     }}
 *
 * Pressing a cluster button while a row was being typed in blurred the field
 * first, and without that early return the cluster unmounted BETWEEN the
 * pointerdown and the click, swallowing the press. Sean removed the inline
 * editor on 2026-08-12 — "no inline name editing from the main screen" — so
 * there is no field, no blur, and nothing to hold open. Keeping those three
 * tests would have meant keeping three tests of nothing.
 *
 * What that spec ALSO happened to be the only cover for is the + and the ‹,
 * and those are still here — so they are tested here, on their own terms
 * instead of as a side-effect of typing. The + used to open the new row for
 * typing; it opens the item window now, because a row with no text and no way
 * to give it any is litter rather than a subtask.
 *
 * The ‹ is observed through the ⧉, which renders only for a top-level row
 * (`r.payload.indent === 0`). That is a real difference in what the row IS,
 * rather than a measurement of where it sits: an indent check by x-offset would
 * pass at any padding, and CLAUDE.md has the scar to prove it.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `st${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

async function addReminder(page: Page, text: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: text })).toBeVisible();
}

/** Hold the row BODY — x+20, not the tick — until the page arms edit mode. */
async function enterEdit(page: Page, text: string) {
  const box = (await page.getByTestId('rem-body').filter({ hasText: text }).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-pencil').first(), 'the page is in edit mode').toBeVisible();
}

// The cluster's + and ‹ carry an accessibility label and no testID; the
// section's + has both, so the ones that DO must be excluded or the section
// add wins the locator.
const clusterAdd = '[aria-label="Add"]:not([data-testid])';
const clusterOut = '[aria-label="Previous"]:not([data-testid])';

test('the + makes a subtask and opens the window to name it', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'buy bread');
  await enterEdit(page, 'buy bread');

  await page.locator(clusterAdd).first().click();

  // The window, not a field in the row. This is the assertion that would have
  // gone red under the old behaviour.
  const field = page.getByPlaceholder(/What\?/);
  await expect(field, 'the item window opened on the new subtask').toBeVisible({ timeout: 10_000 });
  await expect(field, 'and it is blank, waiting for a name').toHaveValue('');
  await field.fill('and jam');
  await page.getByText('Save', { exact: true }).click();

  await expect(page.getByTestId('rem-row').filter({ hasText: 'and jam' }), 'the subtask is named')
    .toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('rem-row'), 'and the parent is still there').toHaveCount(2);
});

test('a subtask abandoned without a name is dropped, not left blank', async ({ page }) => {
  // The inline field did this on blur. The cleanup has to outlive it, or every
  // cancelled + leaves an empty row behind — and an empty row is not something
  // you can tell apart from a bug.
  await signup(page);
  await addReminder(page, 'buy bread');
  await enterEdit(page, 'buy bread');

  await page.locator(clusterAdd).first().click();
  await expect(page.getByPlaceholder(/What\?/)).toBeVisible({ timeout: 10_000 });
  await page.getByText('Cancel', { exact: true }).click();

  await expect(page.getByTestId('rem-row'), 'the unnamed subtask went with the window')
    .toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId('rem-row').filter({ hasText: 'buy bread' }), 'and the parent survived')
    .toHaveCount(1);
});

test('the ‹ lifts a subtask back out to a task of its own', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'buy bread');
  await enterEdit(page, 'buy bread');
  await page.locator(clusterAdd).first().click();
  await page.getByPlaceholder(/What\?/).fill('and jam');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'and jam' })).toBeVisible({ timeout: 10_000 });

  await enterEdit(page, 'and jam');
  // A subtask has no ⧉, so with two rows in edit mode exactly one is offered.
  await expect(page.getByTestId('rem-dup'), 'one of the two rows is a subtask').toHaveCount(1);

  await page.locator(clusterOut).first().click();

  await expect(page.getByTestId('rem-dup'), 'and now both rows are top-level tasks')
    .toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByTestId('rem-row').filter({ hasText: 'and jam' }), 'the text came with it')
    .toHaveCount(1);
});
