/**
 * The event END time (Sean's ask, 2026-08-18): optional, events only, and
 * revealing it PRESUMES an hour past the start. The chip on the day panel
 * reads the pair — "3pm–4pm" — and removing the end takes the chip back to
 * the bare start. Weekday words ride in the same change: "lunch friday"
 * lands on the coming Friday with the word stripped from the title, and the
 * introducing preposition leaves with its token ("standup at 9am" →
 * "standup").
 */
import { test, expect, type Page } from '@playwright/test';

async function longPress(page: Page, locator: ReturnType<Page['getByTestId']>) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `end${Date.now()}${seq++}`;
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

test('an event end presumes start+1h, renders as a range, and can be removed', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);

  // Through the day panel's + Add, so the date is the selected day and the
  // time is an explicit field — nothing here depends on the wall clock.
  await page.getByTestId('cal-add').click();
  await page.getByPlaceholder(/What\?/).fill('movie');
  await page.getByText('+ Time', { exact: true }).click();
  await page.getByPlaceholder('2:30pm').fill('3pm');
  // Revealing End presumes an hour past the start; the presumption sits as
  // the placeholder and saves without being typed.
  await page.getByText('+ End', { exact: true }).click();
  await expect(page.getByPlaceholder('4pm')).toBeVisible();
  await page.getByText('Save', { exact: true }).click();

  const row = page.getByText('3pm–4pm', { exact: true });
  await expect(row, 'the chip reads the range').toBeVisible();

  // Re-open (long-press arms the row's edit cluster): the End row is
  // showing, and × takes the end away for good.
  await longPress(page, page.getByText('movie', { exact: true }));
  await page.getByLabel('Edit').first().click();
  await expect(page.getByPlaceholder(/What\?/)).toBeVisible();
  await page.getByLabel('Remove end').click();
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('3pm', { exact: true }), 'back to the bare start').toBeVisible();
  await expect(page.getByText('3pm–4pm', { exact: true })).toBeHidden();
});

test('an overtyped end beats the presumption', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('cal-add').click();
  await page.getByPlaceholder(/What\?/).fill('dinner');
  await page.getByText('+ Time', { exact: true }).click();
  await page.getByPlaceholder('2:30pm').fill('6pm');
  await page.getByText('+ End', { exact: true }).click();
  await page.getByPlaceholder('7pm').fill('8:30pm');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('6pm–8:30pm', { exact: true })).toBeVisible();
});

test('reminders offer no end row', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('cal-add').click();
  await page.getByTestId('kind-reminder').click();
  await page.getByText('+ Time', { exact: true }).click();
  await expect(page.getByText('+ End', { exact: true }), 'reminders have no end times').toBeHidden();
});

test('a weekday word dates the line and leaves the title, preposition and all', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('party on saturday at 8pm');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'party' });
  await expect(row).toBeVisible();
  // The title kept ONLY its own words — the day, the time, and the words
  // that handed them in are all instructions, not name.
  await expect(row.getByText('party', { exact: true })).toBeVisible();
  // The chip names a Saturday: whatever the date, its weekday label is Sat.
  await expect(row.getByText(/Sat.*8pm/)).toBeVisible();
});
