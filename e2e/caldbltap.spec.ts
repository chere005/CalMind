/**
 * Double-tapping a day-panel row opens edit mode — the one copy of that
 * gesture nothing was watching.
 *
 * The app has it five times: a habit name, a reminder row, a reminders
 * section head, a notes section head, and a calendar day-panel row. Four have
 * a `dblclick` in some spec. The calendar's did not, and it was found the way
 * a blind spot has to be found — by mutation. Zeroing its window
 *
 *     now - lastRowTap.current.at < 300   ->   < 0
 *
 * broke the gesture completely and every existing spec stayed green,
 * `doubletap.spec.ts` included: that file is about a double tap not filing
 * TWO reminders, which is the opposite feature with a confusingly similar
 * name.
 *
 * It is worth a test rather than a shrug because this gesture has regressed
 * here before — "Double-click a habit to enter edit mode (regression)" is a
 * task in this project's own list — and because a long press is the other way
 * in, so the row controls still appear by SOME route while the tap quietly
 * stops working. That is the shape of a bug nobody reports precisely.
 *
 * The assertion is on what edit mode REVEALS (the per-row pencil, duplicate
 * and delete) rather than on internal state, because that is what a person
 * sees and it is what the long-press route is judged by too.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `cd${Date.now()}${seq++}`;
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

/** A dated reminder, added through the calendar so it lands on the day panel. */
async function addOnToday(page: Page, text: string) {
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill(text);
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('day-tick').first()).toBeVisible({ timeout: 10_000 });
}

const editControls = (page: Page) => page.getByRole('button', { name: 'Duplicate' });

test('a double tap on a day-panel row opens edit mode', async ({ page }) => {
  await signup(page);
  await addOnToday(page, 'vet appointment');

  // Nothing parked before the gesture, or the assertion after it proves
  // nothing about the gesture.
  await expect(editControls(page), 'edit mode is off to begin with').toHaveCount(0);

  await page.getByText('vet appointment').dblclick();
  await expect(editControls(page).first(), 'the row controls appear').toBeVisible({ timeout: 5_000 });
});

test('two slow taps are not a double tap', async ({ page }) => {
  await signup(page);
  await addOnToday(page, 'vet appointment');

  // The window is 300ms. Two deliberate taps either side of it must leave the
  // panel alone — without this the test would pass just as well if any tap
  // opened edit mode, which is the mutation in the other direction.
  const row = page.getByText('vet appointment');
  await row.click();
  await page.waitForTimeout(600);
  await row.click();
  await page.waitForTimeout(300);
  await expect(editControls(page), 'a slow pair is two taps, not a double').toHaveCount(0);
});

test('two quick taps on DIFFERENT rows are not a double tap', async ({ page }) => {
  await signup(page);
  await addOnToday(page, 'vet appointment');
  await addOnToday(page, 'collect parcel');

  // The gesture remembers WHICH row it saw, not merely when. Without that
  // check, running a finger down a list fast enough opens edit mode — and
  // neither test above can see it, because both use a single row. Found by
  // dropping the id check and watching them both stay green.
  await expect(editControls(page)).toHaveCount(0);
  await page.getByText('vet appointment').click();
  await page.getByText('collect parcel').click();
  await page.waitForTimeout(400);
  await expect(editControls(page), 'a tap on one row then another is two first taps')
    .toHaveCount(0);
});
