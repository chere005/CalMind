/**
 * Swiping the habits grid pages it, the way the calendar's does.
 *
 * Sean, 2026-08-12. `page()` already knew which unit each view moves in — a
 * week in week view, a month in month view — so the change was the gesture,
 * and the risk was everything else the grid already does with a finger.
 *
 * The third test pins that a vertical drag still reorders. It is a real
 * check — the grips are asserted visible and the order really changes — but
 * WHAT IT DOES NOT PROVE is worth writing down, because the obvious reading
 * is wrong.
 *
 * MEASURED: relaxing the capture to the calendar's rule (|dx| > 12 OR
 * |dy| > 12) leaves all three tests green. The ancestor's MOVE-capture never
 * gets the chance to steal a grip drag, because the grip claims the responder
 * at touch-down, before there is any movement to capture. So this spec does
 * not discriminate the axis, and anyone changing that line should not read a
 * green run as permission.
 *
 * The axis restriction is there for vertical SCROLLING, which this grid does
 * inside its ScrollView and which a capture on |dy| would hijack. That cannot
 * be exercised here: a mouse drag does not scroll a div, and a wheel event is
 * not routed through the responder system at all. It is the hitSlop problem
 * in another costume — real on a phone, invisible to every browser test —
 * and it is written down rather than left to look covered.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `hs${Date.now()}${seq++}`;
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

/** A firm horizontal drag across the grid. Negative dx swipes left. */
async function swipe(page: Page, dx: number) {
  const box = (await page.getByTestId('habits-pan').boundingBox())!;
  const y = box.y + 40;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Several steps: one jump does not read as travel to a pan responder.
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

const label = (page: Page) => page.getByTestId('habits-pager-label').innerText();

test('a sideways swipe pages the week, and back again', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-habits').click();
  const start = await label(page);

  await swipe(page, -160);
  const forward = await label(page);
  expect(forward, 'swiping left moves the week on').not.toBe(start);

  await swipe(page, 160);
  await expect.poll(() => label(page), { message: 'and swiping right comes back' }).toBe(start);

  // A swipe too small to mean it changes nothing — otherwise any stray drag
  // would move the week, and the assertion above would pass for a responder
  // with no threshold at all.
  await swipe(page, -20);
  expect(await label(page), 'a small drag is not a page').toBe(start);
});

test('it pages MONTHS in month view, not weeks', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByText('Month', { exact: true }).click();
  const start = await label(page);
  // The label is the month's name in this view, so a week-sized step would
  // leave it unchanged and this would fail — which is the point.
  await swipe(page, -160);
  const next = await label(page);
  expect(next, 'the month moved on').not.toBe(start);
  await swipe(page, 160);
  await expect.poll(() => label(page), { message: 'and back' }).toBe(start);
});

test('a VERTICAL drag still reorders (see the header: this does not pin the axis)', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-habits').click();

  // Two habits in one section, so there is an order to change.
  for (const name of ['Alpha', 'Beta']) {
    await page.getByTestId(/^habit-add-/).first().click();
    await page.getByTestId('habit-name-field').fill(name);
    await page.getByTestId('habit-save').click();
    await page.waitForTimeout(300);
  }
  const names = () => page.getByTestId('habit-name').allTextContents();
  const before = await names();
  expect(before.length, 'two habits to reorder').toBe(2);

  // Long-press to enter edit mode, where the grips live.
  const first = page.getByTestId('habit-name').first();
  const fb = (await first.boundingBox())!;
  await page.mouse.move(fb.x + 10, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const grip = page.getByTestId('habit-grip').first();
  await expect(grip, 'edit mode really opened and the grips are there').toBeVisible();
  const gb = (await grip.boundingBox())!;
  const rows = page.getByTestId('habit-name');
  const r1 = (await rows.nth(1).boundingBox())!;
  const x = gb.x + gb.width / 2;
  const y = gb.y + gb.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + ((r1.y - y + 10) * i) / 8);
  await page.waitForTimeout(120);
  await page.mouse.up();

  await expect
    .poll(names, { message: 'the vertical drag reordered — the swipe left it alone', timeout: 10_000 })
    .toEqual([before[1]!, before[0]!]);
});
