import { expect, test, type Page, type Locator } from '@playwright/test';

/** Hold a control: the way into edit mode now the pencil is gone. */
async function longPress(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

/**
 * Habit sections reorder by drag — the half nothing was watching.
 *
 * Rows have had a spec since they landed; the section grips beside them never
 * did, and PARITY.md spent a while claiming habits do not drag at all.
 *
 * It took four failed attempts to write this, and every one failed the same
 * way: the drop slots are "before section X", and the end-of-list slot sits
 * 400px BELOW the last header. Anything short of that still reads as "before
 * Morning" — which is where Evening already was. The drags were no-ops by
 * design, and looked exactly like a broken feature. Worth the comment: the
 * next person to test a section drag will reach for a modest distance too.
 */
test('a habit section drags below its neighbour, and stays there', async ({ page }) => {
  test.setTimeout(90_000);
  const user = `hs${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-habits').click();

  await page.getByTestId('pick-habits').click();
  await page.getByText('Manage sections…').click();
  for (const name of ['Evening', 'Morning']) {
    await page.getByPlaceholder('New section').fill(name);
    await page.getByPlaceholder('New section').press('Enter');
  }
  await page.getByText('Done', { exact: true }).click();
  // Hold a SECTION to enter edit mode — where the grips live.
  await longPress(page, page.locator('[data-testid^="hsec-name-"]').first());
  await page.waitForTimeout(400);

  // Read from the section NAMES, not the grips: grips exist only inside edit
  // mode since 2026-08-12, and this order is also read after a reload, when
  // edit mode is long gone.
  const order = async () =>
    page.locator('[data-testid^="hsec-name-"]').evaluateAll((els) =>
      els.map((e) => (e.getAttribute('data-testid') ?? '').replace('hsec-name-', '')));
  expect(await order()).toEqual(['Habits', 'Evening', 'Morning']);

  const from = (await page.getByTestId('hsec-grip-Evening').boundingBox())!;
  const last = (await page.getByTestId('hsec-grip-Morning').boundingBox())!;
  const x = from.x + from.width / 2;
  const y0 = from.y + from.height / 2;
  const y1 = last.y + 420;                 // clear of the last "before" slot
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.waitForTimeout(300);          // the headers are measured on grant
  for (let i = 1; i <= 12; i++) await page.mouse.move(x, y0 + ((y1 - y0) * i) / 12);
  await page.waitForTimeout(150);
  await page.mouse.up();

  await expect.poll(order, { timeout: 10_000 }).toEqual(['Habits', 'Morning', 'Evening']);
  await page.reload();
  await page.getByTestId('tab-habits').click();
  expect(await order(), 'the stored ord is the display order').toEqual(['Habits', 'Morning', 'Evening']);
});
