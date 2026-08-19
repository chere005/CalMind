/**
 * What the + button opens on, and where a reminder filed from it lands.
 *
 * Sean, 2026-08-12, two things about the same screen: it should open on
 * EVENT rather than Reminder, and a reminder added from it should carry
 * today's date rather than none.
 *
 * The second is the one with teeth. An undated reminder is not a small
 * difference in this app: it goes to the all-view and appears on no day at
 * all, so a thing added from the + button — which can only mean now — was
 * findable in one place and invisible in the other. The event card beside it
 * had always used `date ?? today`; the reminder branch simply had not.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ad${Date.now()}${seq++}`;
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

test('the + button opens on Event', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-add').click();
  await expect(page.getByTestId('add-kind-event'), 'Event is the selected card')
    .toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('add-kind-reminder'), 'and Reminder is not')
    .toHaveAttribute('aria-checked', 'false');
});

test('a reminder added from + lands on today, not undated', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('ring the vet');
  await page.getByText('Done', { exact: true }).click();

  // The calendar's day panel is the check that matters: an undated reminder
  // does not appear there at all, which is the whole complaint. Today's is
  // the day the panel opens on.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByText('ring the vet'), 'it is on today, where the + button meant').toBeVisible({ timeout: 10_000 });
});

test('the m/d box is a calendar picker now, and Clear takes the date back', async ({ page }) => {
  // Sean, 2026-08-19: "m/d should be a calendar picker in the add page."
  // Typed dates keep their home in the line itself ("Vet 8/3 2pm"); the
  // little box opens a month grid instead of a keyboard.
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('book the ferry');
  await page.getByText('+ Date/Time', { exact: true }).click();

  // Pick the 15th of NEXT month — a day that cannot be today, so the label
  // changing is proof the pick landed and not a coincidence.
  const n = new Date();
  const target = new Date(n.getFullYear(), n.getMonth() + 1, 15);
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-15`;
  await page.getByTestId('add-date').click();
  await expect(page.getByTestId('daypick')).toBeVisible();
  await page.getByTestId('daypick-next').click();
  await page.getByLabel(iso).click();
  const label = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  await expect(page.getByTestId('add-date')).toContainText(label);

  // Clear puts the box back to no date at all.
  await page.getByTestId('add-date').click();
  await page.getByText('Clear', { exact: true }).click();
  await expect(page.getByTestId('add-date')).toContainText('m/d');

  // Pick again and file: the reminder wears the picked day, which is the
  // stored claim rather than the label's.
  await page.getByTestId('add-date').click();
  await page.getByTestId('daypick-next').click();
  await page.getByLabel(iso).click();
  await page.getByText('Done', { exact: true }).click();
  await page.getByTestId('tab-reminders').click();
  const chip = target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  await expect(page.getByTestId('rem-row').filter({ hasText: 'book the ferry' }).filter({ hasText: chip })).toBeVisible();
});
