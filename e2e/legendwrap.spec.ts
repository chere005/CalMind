import { expect, test } from '@playwright/test';

/**
 * The legend with enough in it to wrap.
 *
 * Sean asked for the legend to balance its lines rather than strand one chip
 * on its own, and for it to name only what the window actually holds. Both
 * shipped; neither had ever been exercised with more than a couple of items,
 * because every event added from the Add screen lands in the same default
 * calendar. This makes real calendars through the manager so the legend has
 * something to balance.
 */
test('a legend with many calendars wraps, balances, and names only what is in view', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = `lw${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  const names = ['Home', 'Work', 'Gym', 'Travel', 'Music', 'Garden'];
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('pick-calendar').click();
  await page.getByText('Manage calendars', { exact: true }).click();
  for (const n of names) {
    await page.getByPlaceholder('New calendar').fill(n);
    await page.getByPlaceholder('New calendar').press('Enter');
  }
  await page.getByText('Done', { exact: true }).click();

  // One event on each, so every calendar has an occurrence in the month.
  for (const n of names) {
    await page.getByText('+ Add', { exact: true }).click();
    await page.getByTestId('kind-event').click();
    await page.getByPlaceholder(/What\?/).fill(`${n} thing`);
    await page.getByTestId('item-dest').click();
    await page.getByText(n, { exact: true }).last().click();
    await page.getByText('Save', { exact: true }).click();
    await page.waitForTimeout(300);
  }

  const legend = page.getByTestId('legend-me');
  await expect(legend).toBeVisible();
  const box = (await legend.boundingBox())!;
  // It wrapped rather than running off the side, and it stayed inside the
  // suite's 22vh — 186pt at this window.
  expect(box.width, 'the legend stays within the screen').toBeLessThanOrEqual(390);
  expect(box.height, 'and within the cap the suite gives it').toBeLessThanOrEqual(Math.round(844 * 0.22));
  // The balance itself, which is what Sean actually asked for: fewest lines
  // first, then the items spread across them rather than one left on its own.
  // Six chips at this width take two lines; three and three is the answer, and
  // a 5/1 split would satisfy "two lines" while being exactly the thing he
  // complained about.
  const rows = await legend.locator('text=/^(Home|Work|Gym|Travel|Music|Garden)$/').evaluateAll((els) => {
    const byLine = new Map<number, number>();
    for (const el of els) {
      const y = Math.round(el.getBoundingClientRect().y);
      byLine.set(y, (byLine.get(y) ?? 0) + 1);
    }
    return [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  });
  expect(rows.length, 'six chips need two lines at this width').toBe(2);
  expect(Math.min(...rows), 'no line is left with a single chip').toBeGreaterThan(1);
  expect(rows.reduce((a, b) => a + b, 0), 'every calendar in view is named').toBe(6);
});
