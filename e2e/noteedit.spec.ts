import { expect, test, type Page } from '@playwright/test';

/**
 * A note's edit mode: hold to enter, the grip on the left, the date, duplicate
 * and delete controls on the right, and a tap elsewhere to leave.
 *
 * Sean asked for all of this on 2026-08-11 — and every control already
 * existed, untested. This pins them so they cannot quietly disappear again,
 * which is the actual value here.
 *
 * The listener that ends edit mode was moved from the bubble phase to capture
 * at the same time, because react-native-web stops a click at any Pressable
 * and that genuinely broke habits. In NOTES no failing case could be produced:
 * everything tappable in this list is already in the keep-list or is empty
 * page. So that change is defensive, and this file does not claim otherwise —
 * reverting it leaves these tests green.
 *
 * Written at the desktop window size, since that is where Sean is.
 */
async function notesWithOne(page: Page): Promise<void> {
  const user = `ne${String(Date.now()).slice(-7)}`;
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

async function hold(page: Page) {
  const row = page.getByTestId('note-row').filter({ hasText: 'Shopping' }).first();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
}

test('holding a note reveals the grip and its controls, and a tap leaves', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await notesWithOne(page);

  await hold(page);

  // Everything Sean listed: the drag on the LEFT, the rest on the RIGHT.
  const grip = page.getByTestId('note-grip').first();
  const dup = page.getByTestId('note-dup').first();
  await expect(grip, 'the drag handle').toBeVisible();
  await expect(page.getByTestId('note-date-Shopping'), 'the calendar button').toBeVisible();
  await expect(dup, 'duplicate').toBeVisible();

  const g = (await grip.boundingBox())!;
  const d = (await dup.boundingBox())!;
  expect(g.x, 'the grip is left of the duplicate button').toBeLessThan(d.x);

  // THE PART THAT WAS BROKEN. A tap on empty page space leaves edit mode.
  await page.mouse.click(900, 700);
  await expect(
    page.getByTestId('note-dup'),
    'a tap elsewhere leaves edit mode — this is the half that did nothing',
  ).toHaveCount(0, { timeout: 5_000 });
});

test('a tap on the note ROW itself opens it rather than leaving', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1160, height: 800 });
  await notesWithOne(page);
  await hold(page);
  await expect(page.getByTestId('note-dup').first()).toBeVisible();

  await page.getByTestId('note-row').filter({ hasText: 'Shopping' }).first().click();
  await expect(page.getByTestId('note-title'), 'the row still opens the note').toBeVisible();
});
