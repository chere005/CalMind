/**
 * Ticking a reminder that "always appears on today" gives you the two
 * seconds back, like every other row.
 *
 * Sean, 2026-08-12: a reminder from the folder that rides along onto today
 * "disappears immediately without the grace period". It did, and the cause
 * was in core rather than on the screen — which is why every existing grace
 * test passed.
 *
 * `dayItems` decided a rider was only a rider `!done`, and an overdue row was
 * only collected onto today `!done`. The grace is a FILTER the screens apply
 * over that list — `showDone || !done || grace.held(id)` — and a filter can
 * only keep a row that is still in the list. Core had already dropped it, so
 * there was nothing left to hold.
 *
 * A DATED reminder never had the problem, because `onDate` never asked about
 * done. That asymmetry is the whole bug, and it is why the existing
 * two-second specs — which use dated rows — were green throughout.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rg${Date.now()}${seq++}`;
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

test('a rider ticked on the day panel waits out its grace before leaving', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);

  // An UNDATED reminder, in a folder switched to 'all' so it RIDES onto
  // today. That tri-state is the whole reason this row exists on the day
  // panel, and it is Sean's own setup.
  //
  // The overdue half of the same fix cannot be reached from the UI at all:
  // the date field rolls a past date forward — '8/1' on 2026-08-12 parses to
  // Aug 1 2027, measured — so there is no way to type a late reminder into
  // existence. That half is pinned in core's day.test.ts instead.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('rider row');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(500);

  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('pick-calendar').click();
  await page.getByTestId('manage-reminders-row').click();
  await page.getByTestId(/^remmode-/).first().click();
  await page.getByTestId('trimode-all').click();
  await page.getByTestId('remfolders-done').click();
  await page.waitForTimeout(500);

  const row = page.getByText('rider row');
  await expect(row, 'the undated reminder rides onto today').toBeVisible({ timeout: 10_000 });

  // Tick it on the day panel.
  await page.getByTestId('day-tick').first().click();

  // STILL THERE a moment later — this is the assertion that was failing for
  // real: before the fix it vanished on the same frame as the tap.
  await page.waitForTimeout(600);
  await expect(row, 'it stays for the grace, so a mis-tap can be taken back').toBeVisible();

  // And the tick can actually be taken back inside the window.
  await page.getByTestId('day-tick').first().click();
  await page.waitForTimeout(2_600);
  await expect(row, 'unticked inside the window, it simply stays').toBeVisible();

  // Ticked and left alone, it goes when the grace runs out.
  await page.getByTestId('day-tick').first().click();
  await expect
    .poll(async () => row.count(), { message: 'and after the two seconds it leaves', timeout: 15_000 })
    .toBe(0);
});
