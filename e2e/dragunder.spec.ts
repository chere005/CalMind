/**
 * A row disappearing ABOVE the one you are dragging must not move the wrong
 * row.
 *
 * The drag measures every row at grant and resolves the drop by INDEX:
 * `onDrop(from, to)`, and the screen then reads `flatRows[from]`. Those two
 * moments are not the same moment. If the list changes in between, `from`
 * points at a different row — and the list can change on its own, without any
 * gesture from the user, because a ticked row lingers for its two-second
 * grace and then leaves.
 *
 * So: tick the top row, start dragging a row below it, and hold the gesture
 * past the grace. The list shrinks by one ABOVE the dragged row while the
 * drag is in flight.
 *
 * IT HANDLES IT. This test found no bug — it is here because the code reads
 * as though it should, and the next person to read it will think so too. The
 * measurement is the answer, and now it is a standing one.
 *
 * The assertion is deliberately unambiguous, which took two attempts. Dropping
 * one row down produced a list equally consistent with "the right row moved"
 * and "the row below it moved" — an assertion that passes either way is no
 * assertion, the same trap as an offset measured from an element's own edge.
 * Six rows and a three-row drop separate the two: the right answer is
 * b,d,e,c,f and the wrong one is not.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `du${Date.now()}${seq++}`;
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

test('a ticked row leaving mid-drag does not redirect the drag', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // Added newest-first, so the list reads a b c d e f.
  for (const t of ['f', 'e', 'd', 'c', 'b', 'a']) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('rem-add-field').fill(t);
    await page.getByTestId('rem-add-field').press('Enter');
  }
  const order = () => page.getByTestId('rem-body').allTextContents();
  await expect.poll(order).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

  // Edit mode, where the grips are.
  const body = page.getByTestId('rem-body').filter({ hasText: 'c' }).first();
  const bb = (await body.boundingBox())!;
  await page.mouse.move(bb.x + 20, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const rows = page.getByTestId('rem-row');
  await rows.first().getByTestId('tick').click();            // 'a' — above 'c'
  const rowH = (await rows.nth(1).boundingBox())!.height;

  const grip = rows.filter({ hasText: 'c' }).first().getByTestId('row-grip');
  const gb = (await grip.boundingBox())!;
  const x = gb.x + gb.width / 2;
  const y = gb.y + gb.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 8);
  // The grace is two seconds from the tick; hold well past it so 'a' leaves
  // while this gesture is already measured and in flight.
  await page.waitForTimeout(2600);
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + (i * rowH * 3) / 6);
  await page.waitForTimeout(150);
  await page.mouse.up();

  await expect
    .poll(order, { message: 'c moved three down; the vanished row did not redirect it', timeout: 10_000 })
    .toEqual(['b', 'd', 'e', 'c', 'f']);
});
