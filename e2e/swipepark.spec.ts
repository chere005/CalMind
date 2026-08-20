/**
 * Parking a swipe-delete must not move the row it parks on.
 *
 * Sean, 2026-08-20: "things shift with slide to delete". The parked × was an
 * ordinary flex child at the row's end, so the body (flex: 1) surrendered its
 * width and the text and chips slid left — the exact bug the edit cluster
 * had, fixed the same way: the × floats over the row's right edge on an
 * opaque background, out of the flex flow (swipePark, on all four screens
 * that park one).
 *
 * Measured as boxes before and after the swipe, on the two list shapes —
 * Reminders and Notes; the Calendar's rows and the recipe editor's share the
 * mechanism by the same style.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `sp${Date.now()}${seq++}`;
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

async function swipeLeft(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, y);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test('a parked delete floats over the reminder row instead of squeezing it', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('water the plants friday');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);

  const body = page.getByTestId('rem-body').first();
  const before = (await body.boundingBox())!;
  await swipeLeft(page, before);
  await expect(page.getByTestId('swipe-del')).toBeVisible();

  const after = (await body.boundingBox())!;
  expect(Math.round(after.width), 'the body keeps its width — nothing squeezed it')
    .toBe(Math.round(before.width));
  expect(Math.round(after.x), 'and its place').toBe(Math.round(before.x));
});

test('a tap anywhere else puts the parked delete away', async ({ page }) => {
  // Sean, 2026-08-20: "tap to exit swipe to delete doesn't work". Only the
  // row's own tap cleared it, so a one-press delete sat armed under a finger
  // that had moved on. The rule lives in useSwipeLeft (web) and the screens'
  // EditExit (native) — one place each, not five screens.
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('take the bins out');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);

  const body = page.getByTestId('rem-body').first();
  await swipeLeft(page, (await body.boundingBox())!);
  await expect(page.getByTestId('swipe-del'), 'parked to begin with').toBeVisible();

  // Blank space well below the list — not the row, not the control.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, Math.round(vp.height * 0.8));
  await expect(page.getByTestId('swipe-del'), 'and a tap elsewhere puts it away').toHaveCount(0);
  // The reminder is still there: putting the × away is not deleting.
  await expect(page.getByText('take the bins out')).toBeVisible();

  // …and the control still WORKS when it is the thing you press — the guard
  // that would fail if the unpark listener ate its own confirming press.
  await swipeLeft(page, (await body.boundingBox())!);
  await page.getByTestId('swipe-del').click();
  await expect(page.getByText('take the bins out')).toHaveCount(0);
});

test('the same on a note row', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-back').click();

  const row = page.getByTestId('note-row').first();
  const before = (await row.boundingBox())!;
  await swipeLeft(page, before);
  await expect(page.getByRole('button', { name: 'Confirm delete' }).first()).toBeVisible();

  const after = (await row.boundingBox())!;
  expect(Math.round(after.width), 'the note row keeps its width').toBe(Math.round(before.width));
  expect(Math.round(after.x), 'and its place').toBe(Math.round(before.x));
});
