import { expect, test, type Page } from '@playwright/test';

/**
 * The calendar's up/down swipe, started on the LEGEND.
 *
 * Sean, 2026-08-11: "swipe up and down gesture on the calendar app should be
 * able to drag from the legend, not just the calendar itself.. just the
 * gesture, don't change the behavior". The legend is a sibling of the grid,
 * not part of it, so the pan responder never covered it and a swipe begun
 * down there did nothing at all.
 *
 * "Don't change the behavior" is the other half, and is checked too: the same
 * swipe must still toggle week mode, and a TAP on a legend chip must still be
 * a tap — the responder only claims after real travel, and a legend that
 * swallowed taps would be a worse bug than the one being fixed.
 */
async function calendarWithLegend(page: Page) {
  const user = `lg${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  // A dated reminder puts something in the legend to grab. Signing up lands
  // on the calendar, so the list has to be asked for first.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId(/^secadd-/).first().click();
  const field = page.getByPlaceholder('New reminder').first();
  await field.fill('dentist today');
  await field.press('Enter');

  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('cal-legend'), 'the legend is drawn at all').toBeVisible();
}

/**
 * A real drag: press, several PACED moves, release.
 *
 * The pacing is not decoration. Moves dispatched back-to-back in one tick do
 * not drive React Native's PanResponder on the web — the same drag with no
 * gap between moves leaves the grid untouched, which reads exactly like the
 * gesture not being wired up. Verified by running this against the GRID,
 * where the gesture has always worked, before trusting it against the legend.
 */
async function dragUp(page: Page, from: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x, from.y - i * 12);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

test('an up-swipe that STARTS on the legend does what one on the grid does', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await calendarWithLegend(page);

  const rowsBefore = await page.getByTestId('cal-cell').count();

  // The CENTRE of the legend, which is where the chips are — the case that
  // did nothing. The empty margins either side of them worked all along,
  // which is what made this look like a responder problem for so long.
  const legend = (await page.getByTestId('cal-legend').boundingBox())!;
  await dragUp(page, { x: legend.x + legend.width / 2, y: legend.y + legend.height / 2 });
  await page.waitForTimeout(400);

  const rowsAfter = await page.getByTestId('cal-cell').count();
  expect(
    rowsAfter,
    'the swipe collapsed the month to a week, exactly as it does from the grid',
  ).toBeLessThan(rowsBefore);
});

test('a DOWN swipe from the legend opens the month back up', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await calendarWithLegend(page);

  // Collapse first, from the grid, so there is something to open back up.
  const grid = (await page.getByTestId('cal-grid').boundingBox())!;
  await dragUp(page, { x: grid.x + grid.width / 2, y: grid.y + grid.height / 2 });
  await page.waitForTimeout(400);
  const collapsed = await page.getByTestId('cal-cell').count();

  // Down, from the legend. This is the direction that travels AWAY from the
  // grid, so it cannot be the grid's responder quietly doing the work.
  const legend = (await page.getByTestId('cal-legend').boundingBox())!;
  const x = legend.x + legend.width / 2, y = legend.y + legend.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x, y + i * 12); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(400);

  expect(
    await page.getByTestId('cal-cell').count(),
    'the month opens back up from a downward swipe begun on the legend',
  ).toBeGreaterThan(collapsed);
});

test('…and a tap on the legend is still a tap', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await calendarWithLegend(page);

  const rowsBefore = await page.getByTestId('cal-cell').count();
  const legend = (await page.getByTestId('cal-legend').boundingBox())!;
  await page.mouse.click(legend.x + legend.width / 2, legend.y + legend.height / 2);
  await page.waitForTimeout(400);

  expect(
    await page.getByTestId('cal-cell').count(),
    'a press with no travel changes nothing — the responder needs real movement',
  ).toBe(rowsBefore);
});
