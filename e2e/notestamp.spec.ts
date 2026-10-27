import { expect, test, type Page } from '@playwright/test';

/**
 * The clock pill in the note editor (Sean, 2026-10-26): it drops the date and
 * time in at the caret WHILE you type, and typing carries straight on after it.
 *
 * The second test is the bug that rode along: every format pill used to write
 * the record but not the field's draft, so mid-typing it did nothing on screen
 * and the next keystroke wrote the draft back over it.
 */
async function editingNote(page: Page): Promise<void> {
  const user = `ns${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Log');
  await page.getByTestId('note-body-view').click();
  await expect(page.getByTestId('note-body-edit')).toBeFocused();
}

const STAMP = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4} at \d{1,2}(:\d{2})?(am|pm)/;

test('the clock pill stamps now at the caret, and typing carries on after it', async ({ page }) => {
  test.setTimeout(90_000);
  await editingNote(page);
  const body = page.getByTestId('note-body-edit');
  await page.keyboard.type('Called');
  await page.getByTestId('note-stamp').click();
  await expect(body, 'still typing — the pill did not take the focus').toBeFocused();
  await page.keyboard.type('done');
  await expect(body).toHaveValue(new RegExp(`^Called ${STAMP.source} done$`));

  // Leave and come back: the record has it, not just the field — and the
  // read view draws it as the stamp card, between the words either side.
  await page.getByTestId('note-back').click();
  await page.getByTestId('note-row').filter({ hasText: 'Log' }).first().click();
  const view = page.getByTestId('note-body-view');
  await expect(view.getByTestId('note-stamp-chip')).toHaveCount(1);
  await expect(view.getByTestId('note-stamp-chip')).toHaveText(new RegExp(`^${STAMP.source.replace(' at ', ' · ')}$`));
  await expect(view).toContainText('Called');
  await expect(view).toContainText('done');
  // Plain words underneath: Copy as Markdown hands out the stamp as typed.
  await page.getByTestId('note-body-view').click();
  await expect(page.getByTestId('note-body-edit')).toHaveValue(new RegExp(`^Called ${STAMP.source} done$`));
});

test('a read-only tap on the clock adds the stamp at the end of the note', async ({ page }) => {
  test.setTimeout(90_000);
  await editingNote(page);
  await page.keyboard.type('First line');
  await page.getByTestId('note-title').click();
  await expect(page.getByTestId('note-body-view')).toBeVisible();
  await page.getByTestId('note-stamp').click();
  await expect(page.getByTestId('note-body-view')).toContainText('First line');
  await expect(page.getByTestId('note-stamp-chip')).toHaveCount(1);
});

test('a format pill mid-typing lands in the field and survives the next keystroke', async ({ page }) => {
  test.setTimeout(90_000);
  await editingNote(page);
  const body = page.getByTestId('note-body-edit');
  await page.keyboard.type('milk');
  await page.getByText('· List', { exact: true }).click();
  await page.keyboard.type('!');
  await expect(body).toHaveValue('- milk!');
});

test('mid-line, the caret lands right after the stamp', async ({ page }) => {
  test.setTimeout(90_000);
  await editingNote(page);
  const body = page.getByTestId('note-body-edit');
  await page.keyboard.type('ab');
  await page.keyboard.press('ArrowLeft');
  await page.getByTestId('note-stamp').click();
  await page.keyboard.type('X');
  await expect(body).toHaveValue(new RegExp(`^a ${STAMP.source} Xb$`));
});
