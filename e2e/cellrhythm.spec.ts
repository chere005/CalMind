import { expect, test } from '@playwright/test';

/**
 * The month grid's vertical rhythm — Sean, 2026-08-19: "the date in each
 * calendar square should have the same amount of space between the top of
 * the calendar square and the top of the icons in the calendar square."
 *
 * The break was structural: an ordinary date is a bare <Text> whose box is
 * its font's natural line (~16px), while TODAY's date sits in an 18px
 * circle View — so the mark well below started lower in today's cell than
 * in every other, and the whole column of today read as pushed down. The
 * fix seats BOTH in one fixed-height slot; this spec measures the real
 * boxes and holds every cell to the same offset, today included.
 */
test('every cell starts its icons the same distance from its top', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `cr${String(Date.now()).slice(-8)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible();

  const offsets: { today: boolean; gap: number }[] = await page.evaluate(() => {
    const out: { today: boolean; gap: number }[] = [];
    for (const cell of document.querySelectorAll('[data-testid="cal-cell"]')) {
      const well = cell.querySelector('[data-testid="cal-mark-well"]');
      if (!well) continue;
      const gap = well.getBoundingClientRect().top - cell.getBoundingClientRect().top;
      // Today's cell is the one holding a filled circle — a styled View
      // around the number. Detect it by background rather than by date so
      // the spec needs no clock.
      const today = [...cell.querySelectorAll('div')].some((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && el.querySelector('div,span') !== null && el.textContent!.trim().length <= 2;
      });
      out.push({ today, gap: Math.round(gap * 10) / 10 });
    }
    return out;
  });

  expect(offsets.length).toBeGreaterThan(20);
  const todayCell = offsets.find((o) => o.today);
  expect(todayCell, 'the grid holds a today circle').toBeTruthy();
  const gaps = [...new Set(offsets.map((o) => o.gap))];
  // One rhythm for the whole grid, half-pixel tolerance for rounding.
  const spread = Math.max(...offsets.map((o) => o.gap)) - Math.min(...offsets.map((o) => o.gap));
  expect(spread, `icon rows start at a single offset (saw ${JSON.stringify(gaps)})`).toBeLessThanOrEqual(0.5);
});
