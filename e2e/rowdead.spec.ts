import { expect, test, type Page } from '@playwright/test';

/**
 * A row that looks tappable all over, and is not.
 *
 * Notes draws its rows 44pt tall — `row: { height: 44 }` — and centres the
 * contents. The Pressable INSIDE it (`note-row`) is a flex child with no
 * height of its own, so it collapses to its one line of text, about 18pt, and
 * sits in the middle. The other 26pt look exactly like the row because they
 * ARE the row; they simply do not answer. Measured, not guessed:
 * tools/sweep-tap-targets.mjs reports note-row at 240x18 inside a 44pt row.
 *
 * That is invisible in every existing test, because a test clicks the centre
 * of what it means to click and the centre has always worked.
 *
 * WHERE THE CLICKS GO. Both are measured from the row's own vertical CENTRE,
 * outward by a fixed distance, never as an offset from an edge — an edge
 * offset lands inside the element whatever size it is, so it passes with the
 * bug present and with it absent. 15pt is the number: more than the 9pt
 * half-height of the collapsed press box, less than the 22pt half-height of
 * the row, so it is unambiguously inside the row and outside the box.
 */
async function notesWithOne(page: Page): Promise<void> {
  const user = `rd${String(Date.now()).slice(-7)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Shopping');
  await page.getByTestId('note-back').click();
  await expect(page.getByTestId('note-row').filter({ hasText: 'Shopping' })).toHaveCount(1);
}

test('the whole height of a note row opens the note, not just its middle', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await notesWithOne(page);

  const row = page.getByTestId('note-row').filter({ hasText: 'Shopping' }).first();
  const press = (await row.boundingBox())!;
  // The drawn row is the Pressable's parent; that is the height a finger aims
  // at. Reading it from the page rather than hard-coding 44 keeps this honest
  // if the row is ever restyled.
  const rowH = await row.evaluate((el) => el.parentElement!.getBoundingClientRect().height);
  const rowMid = await row.evaluate((el) => {
    const r = el.parentElement!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });

  expect(rowH, 'the row is tall enough for this test to mean anything').toBeGreaterThan(36);

  // Near the top of the row: inside it, well outside a collapsed press box.
  await page.mouse.click(rowMid.x, rowMid.y - 15);
  await expect(
    page.getByTestId('note-title'),
    'a click 15pt above the row centre opens the note',
  ).toBeVisible({ timeout: 4_000 });
  await page.getByTestId('note-back').click();
  await expect(page.getByTestId('note-row').first()).toBeVisible();

  // …and near the bottom, so a fix that only stretches upward is not enough.
  await page.mouse.click(rowMid.x, rowMid.y + 15);
  await expect(
    page.getByTestId('note-title'),
    'and 15pt below it does too',
  ).toBeVisible({ timeout: 4_000 });

  // The press box really does span the row now, which is the thing itself
  // rather than a consequence of it.
  expect(Math.round(press.height), 'the pressable fills the row').toBeGreaterThanOrEqual(Math.round(rowH) - 1);
});

/**
 * The same shape in Reminders, where the row is 36pt and `rem-body` was 18.
 *
 * A single tap on a reminder does nothing observable — it is half of a
 * double-click — so the gesture asserted here is the LONG PRESS, which is the
 * documented way into edit mode and lands on the same Pressable.
 */
test('the whole height of a reminder row answers a long press', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  const user = `rd${String(Date.now()).slice(-7)}b`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('call the vet');
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByText('call the vet')).toBeVisible();

  const body = page.getByTestId('rem-body').first();
  const rowH = await body.evaluate((el) => el.parentElement!.getBoundingClientRect().height);
  const mid = await body.evaluate((el) => {
    const r = el.parentElement!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  expect(rowH, 'the row is tall enough for this to mean anything').toBeGreaterThan(30);

  // 12pt from the centre: outside the 9pt half-height of the collapsed press
  // box, inside the 18pt half-height of the row. Narrower than the Notes case
  // only because the row itself is shorter.
  await page.mouse.move(mid.x, mid.y - 12);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();

  await expect(
    page.getByTestId('rem-pencil').first(),
    'a long press 12pt above the row centre enters edit mode',
  ).toBeVisible({ timeout: 4_000 });
});
