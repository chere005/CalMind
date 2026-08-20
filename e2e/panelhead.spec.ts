/**
 * The day panel's head row — the date, and since 2026-08-20 the date ALONE.
 *
 * THIS FILE HAS ARGUED THREE WAYS NOW, and the history is the useful part.
 *
 * Sean, 2026-08-13, asked for the "+ Add" pill beside the date to be aligned,
 * tighter under the legend, and shorter; then reversed two of the three on
 * sight ("looks terrible.. make the add button the same height and center
 * aligned"). This file pinned each round. Then on 2026-08-20 he removed the
 * button altogether — "remove the additional add button on calendar" — the
 * Add TAB inherits the calendar's selected day (addfromday.spec.ts), so the
 * pill was a second door to the same room.
 *
 * What survives here:
 *   · the REMOVAL is pinned, so the button cannot quietly return;
 *   · the tighter gap under the legend — the one ask of 2026-08-13 that was
 *     never reversed — now measured to the date title that leads the panel.
 */
import { expect, test, type Page } from '@playwright/test';

async function signup(page: Page) {
  const user = `ph${Date.now()}${Math.floor(Math.random() * 999)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

/** An event on today, so the legend exists and the gap under it is the real
 *  one — made through the Add tab, which is now the only door. */
async function anEvent(page: Page) {
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-text').fill('dentist');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('cal-legend')).toBeVisible({ timeout: 10_000 });
}

test('the calendar offers no add button of its own', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  // Pinned by the LABEL, not the old testid: testids.spec forbids reaching
  // for a name nothing renders (an absence assertion on it can never fail),
  // and it is right — a returning button would say "+ Add" again, and words
  // on the screen are what Sean asked to be rid of.
  await expect(page.getByText('+ Add', { exact: true })).toHaveCount(0);
  // The one way in is the tab bar's Add, which is on screen right now.
  await expect(page.getByTestId('tab-add')).toBeVisible();
});

test('the day title sits close under the legend', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await anEvent(page);

  const gap = await page.evaluate(() => {
    const legend = document.querySelector('[data-testid="cal-legend"]')!;
    const title = document.querySelector('[data-testid="cal-day-title"]')!;
    return +(title.getBoundingClientRect().top - legend.getBoundingClientRect().bottom).toFixed(1);
  });
  // The legend's closing 1pt rule and the panel's 10pt paddingTop, and
  // nothing else. It was 17 before the padding came down (2026-08-13).
  expect(gap, 'the legend’s rule and the panel’s padding, and nothing else').toBeLessThanOrEqual(12);
  expect(gap, 'still a gap, not a collision').toBeGreaterThanOrEqual(3);
});
