/**
 * The Add tab inherits the calendar's selected day (Sean, 2026-08-20: "the
 * add app when launched from a particular day should default from that day"
 * — and in the same breath the day panel's own "+ Add" button was removed,
 * so this inheritance is the ONE way to file something onto a chosen day).
 *
 * The launch day is an INCUMBENT, not a manual choice — ItemModal's own
 * ranking, applied here: a date typed into the line beats it, a bare time's
 * implied "today" does not. And an Add opened from any other tab still means
 * today, so the inheritance is scoped to having been LOOKING at the day.
 */
import { expect, test, type Page } from '@playwright/test';

async function signup(page: Page) {
  const user = `afd${Date.now()}${Math.floor(Math.random() * 999)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

/** A current-month day that is not today. Numbers below 29 appear exactly
 *  once in a month grid, so the cell can be found by its text alone. */
function otherDayNum(): number {
  return new Date().getDate() === 20 ? 10 : 20;
}

test('an Add launched from a day files onto that day', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-calendar').click();

  const num = otherDayNum();
  await page.getByTestId('cal-cell').getByText(String(num), { exact: true }).click();
  await expect(page.getByTestId('cal-day-title')).toContainText(` ${num}`);

  await page.getByTestId('tab-add').click();
  // The screen SAYS which day it will file on — the date line is the launch
  // day, not today.
  await expect(page.getByTestId('add-date-line')).toContainText(` ${num}`);
  await page.getByTestId('add-text').fill('dinner 6pm');
  await page.getByText('Done', { exact: true }).click();

  // Back on the calendar, still on that day, and the event is on it.
  await expect(page.getByTestId('cal-day-title')).toContainText(` ${num}`);
  await expect(page.getByText('dinner', { exact: true })).toBeVisible();
  await expect(page.getByText('6pm', { exact: true })).toBeVisible();
});

test('a date typed into the line still beats the launch day', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  const num = otherDayNum();
  await page.getByTestId('cal-cell').getByText(String(num), { exact: true }).click();

  // An EXPLICIT full date outranks the incumbent — the token is an
  // instruction, exactly as it is in the item sheet.
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('trip 12/25');
  await page.getByText('Done', { exact: true }).click();

  await page.getByTestId('tab-reminders').click();
  const row = page.getByTestId('rem-row').filter({ hasText: 'trip' });
  await expect(row).toBeVisible();
  await expect(row, 'the typed date won').toContainText('Dec 25');
});

test('an Add launched anywhere else still means today', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  const num = otherDayNum();
  await page.getByTestId('cal-cell').getByText(String(num), { exact: true }).click();

  // Leave the calendar first: the selected day is still remembered there,
  // but an Add from Reminders is about today, not about it.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('tab-add').click();
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  await expect(page.getByTestId('add-date-line')).toHaveText(todayLabel);
});
