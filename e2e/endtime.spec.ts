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

  // Through the Add tab from the calendar (the day panel's own + Add is gone,
  // 2026-08-20) — the date defaults to the selected day and the time is an
  // explicit field, so nothing here depends on the wall clock.
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-text').fill('movie');
  await page.getByText('+ Date/Time', { exact: true }).click();
  await page.getByPlaceholder('2:30pm').fill('3pm');
  // Revealing End presumes an hour past the start; the presumption sits as
  // the placeholder and saves without being typed.
  await page.getByText('+ End', { exact: true }).click();
  await expect(page.getByPlaceholder('4pm')).toBeVisible();
  await page.getByText('Done', { exact: true }).click();

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
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-text').fill('dinner');
  await page.getByText('+ Date/Time', { exact: true }).click();
  await page.getByPlaceholder('2:30pm').fill('6pm');
  await page.getByText('+ End', { exact: true }).click();
  await page.getByPlaceholder('7pm').fill('8:30pm');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByText('6pm–8:30pm', { exact: true })).toBeVisible();
});

test('reminders offer no end row', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByText('+ Date/Time', { exact: true }).click();
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

test('a typed range sets both ends, with no panel opened', async ({ page }) => {
  // Sean, 2026-08-20: "add range parsing to time specifications everywhere".
  // The end field lives behind "+ Date/Time" → "+ End"; a range typed on the
  // line must not need either, or it is a half-feature.
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-event').click();
  await page.getByTestId('add-text').fill('Lunch with Ada 12-1pm');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();

  const row = page.getByTestId('dp-ev-body').filter({ hasText: 'Lunch' }).first();
  await expect(row, 'the range left the title').toHaveText('Lunch with Ada');
  // The chip is the panel's own range label, so it proves BOTH ends landed.
  await expect(page.getByText('12pm–1pm', { exact: true })).toBeVisible();
});

test('and the round trip closes: copy an event, paste it, get the same event', async ({ page, context }) => {
  // The reason the parser learned ranges — eventLine emitted one and nothing
  // could read it back. Both halves through the real UI, not through core.
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-event').click();
  await page.getByTestId('add-text').fill('Standup 9-10am');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();
  await expect(page.getByText('9am–10am', { exact: true })).toBeVisible();

  const body = page.getByTestId('dp-ev-body').first();
  const b = (await body.boundingBox())!;
  await page.mouse.move(b.x + 15, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.getByTestId('dp-ev-copy').first().click();
  await expect(page.getByTestId('toast')).toHaveText('Copied', { timeout: 10_000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText());

  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-event').click();
  await page.getByTestId('add-text').fill(clip);
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();

  // Two events, same words, same range — nothing left behind in a title.
  const rows = page.getByTestId('dp-ev-body').filter({ hasText: 'Standup' });
  await expect(rows).toHaveCount(2);
  for (const r of await rows.all()) await expect(r).toHaveText('Standup');
  await expect(page.getByText('9am–10am', { exact: true })).toHaveCount(2);
});
