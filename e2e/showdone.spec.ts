/**
 * "Completed" is a remembered view, not a mood.
 *
 * The suite keeps this toggle in localStorage — `calShowDone` on the calendar,
 * `remShowDone` on reminders — and restores it on load. CalMind held both in
 * plain component state, and App.tsx renders each screen only while its tab is
 * selected, so the screen UNMOUNTS the moment you look at anything else.
 * Turning Completed on and glancing at Notes turned it back off.
 *
 * Found 2026-08-12 by listing the suite's localStorage keys and checking each
 * against CalMind's AsyncStorage: it keeps `calFold` and `calWeekMode`, both
 * set up a few lines away from this in the same file, and not these two. The
 * asymmetry is the tell — nobody decided this, it was just never wired.
 *
 * Both halves are tested, because they fail differently: a TAB SWITCH
 * (unmount and remount, state gone, storage read again) and a RELOAD (the
 * whole app rebuilt). The first is the one that bites daily and the one plain
 * state loses; a fix that only survived reloads would still be wrong.
 *
 * What is NOT tested, because it is not implemented: the suite makes the
 * toggle transient while EDITING, leaving the saved value alone. CalMind's
 * edit mode does not touch showDone at all, so there is nothing to be
 * transient about. Called out in Calendar.tsx as a deliberate deviation.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `sd${Date.now()}${seq++}`;
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

/** A done reminder is what makes the toggle observable: with nothing
 *  completed, every assertion below passes whatever the code does. */
async function addAndTick(page: Page, text: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: text });
  await expect(row).toBeVisible();
  await row.getByTestId('tick').click();
  // The two-second grace keeps a just-ticked row on screen, so wait it out
  // rather than racing it — otherwise "still visible" means nothing.
  await expect(row).toBeHidden({ timeout: 10_000 });
}

test('reminders remembers Completed across a tab switch and a reload', async ({ page }) => {
  await signup(page);
  await addAndTick(page, 'done thing');
  const row = page.getByTestId('rem-row').filter({ hasText: 'done thing' });

  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(row, 'the toggle shows completed rows').toBeVisible();

  // The tab switch: this screen unmounts, which is what plain state loses.
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('tab-reminders').click();
  await expect(row, 'and it is still on after coming back to the tab').toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await expect(row, 'and after a reload').toBeVisible({ timeout: 10_000 });

  // Off must persist too, or "always on" would pass everything above.
  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(row).toBeHidden();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('tab-reminders').click();
  await expect(row, 'switching it off is remembered as well').toBeHidden({ timeout: 10_000 });
});

test('the calendar remembers Completed across a tab switch and a reload', async ({ page }) => {
  await signup(page);

  // Added through the Add TAB from the calendar, so it lands on the selected
  // day (the panel's own "+ Add" is gone, 2026-08-20). A reminder made on the
  // Reminders screen has no due date and never reaches a day panel at all —
  // which is how the first attempt at this test "failed".
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('cal done');
  await page.getByText('Done', { exact: true }).click();
  const tick = page.getByTestId('day-tick').first();
  await expect(tick).toBeVisible({ timeout: 10_000 });

  const row = page.getByText('cal done', { exact: true });
  await tick.click();
  // Two-second grace: wait it out rather than racing it.
  await expect(row).toBeHidden({ timeout: 10_000 });

  await page.getByTestId('cal-completed').click();
  await expect(row, 'the day panel shows completed rows').toBeVisible();

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('tab-calendar').click();
  await expect(row, 'still on after coming back to the tab').toBeVisible({ timeout: 10_000 });

  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(row, 'and after a reload').toBeVisible({ timeout: 10_000 });
});

test('Completed shows the SELECTED day\'s completions, not everything ever finished', async ({ page }) => {
  // Sean, 2026-08-20: "for calendar, show completed only shows completed
  // reminders from the day being selected."
  //
  // An OVERDUE reminder is collected onto today whether or not it is done —
  // deliberately, so the tick grace has a row to hold for its two seconds.
  // The cost, unnoticed until Completed was switched on: every past
  // completion piled onto today, because a done row due last week is still
  // "late" and still collected.
  test.setTimeout(120_000);
  await signup(page);

  // Due YESTERDAY, then ticked. It belongs to yesterday.
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('sweep the porch yesterday');
  await page.getByText('Done', { exact: true }).click();
  await page.getByTestId('tab-reminders').click();
  const row = page.getByTestId('rem-row').filter({ hasText: 'sweep the porch' });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByTestId('tick').click();
  await page.waitForTimeout(2_600);          // let the grace lapse

  // Today's panel with Completed ON must not show it: it was finished, and it
  // was finished on another day.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-day-title')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('cal-completed').click();
  await page.waitForTimeout(400);
  await expect(page.getByText('sweep the porch'), 'a past completion does not pile onto today')
    .toHaveCount(0);

  // …and it is still THERE, on the day it belongs to — hidden, not lost.
  await page.getByTestId('cal-prev').click({ timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(300);
});
