/**
 * Changing an item's KIND and its text in one visit keeps both.
 *
 * The edit sheet can do two things at once: retype the title, and change what
 * the item IS. Core's conversion works from the STORED record — it has to,
 * since it re-homes the row and mints the replacement — so anything typed in
 * the sheet beforehand was simply not part of it. Retype a reminder and turn
 * it into a note, and the note arrived carrying the words you had replaced,
 * with no sign anything had been dropped.
 *
 * Measured before the fix: typed "call the vet about the booster", the note's
 * title read "call the vet".
 *
 * The sheet already computes `title`, `finalDate`, `finalTime` and
 * `finalRepeat` for the ordinary save a few lines below. The conversion now
 * applies the same four to the record core hands back, so the two paths agree
 * about what the sheet said.
 *
 * Found by sweeping for the shape of the Reminders cluster bug — a handler
 * that saves, or converts, and then acts on a value the save did not reach.
 * That one read a stale `recs`; this one never read the edits at all.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ce${Date.now()}${seq++}`;
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

/** A reminder on today, added through the Add tab from the calendar — the
 *  panel's own "+ Add" is gone (2026-08-20), and the tab inherits the day. */
async function addReminder(page: Page, text: string) {
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill(text);
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('day-tick').first()).toBeVisible({ timeout: 10_000 });
}

/** Open the edit sheet for a day-panel row: double tap in, then the pencil. */
async function openEditSheet(page: Page, text: string) {
  await page.getByText(text).dblclick();
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await expect(page.getByPlaceholder(/What\?/)).toBeVisible();
}

test('a reminder retyped AND turned into a note keeps the new words', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'call the vet');
  await openEditSheet(page, 'call the vet');

  await page.getByPlaceholder(/What\?/).fill('call the vet about the booster');
  await page.getByTestId('kind-note').click();
  await page.getByText('Save', { exact: true }).click();

  // The conversion navigates to the new note, so its title field is the
  // answer — and it is the field, not the row, because a note's title is an
  // input and never appears in the page's text.
  await page.getByTestId('tab-notes').click();
  await expect
    .poll(async () => page.getByTestId('note-title').inputValue().catch(() => ''),
      { message: 'the note carries what was typed, not what was replaced', timeout: 10_000 })
    .toBe('call the vet about the booster');
});

test('…and the other direction, reminder to event, keeps it too', async ({ page }) => {
  await signup(page);
  await addReminder(page, 'collect parcel');
  await openEditSheet(page, 'collect parcel');

  await page.getByPlaceholder(/What\?/).fill('collect parcel from the depot');
  await page.getByTestId('kind-event').click();
  await page.getByText('Save', { exact: true }).click();

  // An event stays on the day panel, so the row itself is the evidence.
  await expect(page.getByText('collect parcel from the depot'), 'the event carries the new text')
    .toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('collect parcel', { exact: true }), 'and not the old')
    .toHaveCount(0);
});
