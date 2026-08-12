/**
 * Edit mode, on every screen that has one: you can tap your way out of it,
 * and entering it does not move anything.
 *
 * Sean, 2026-08-12, asked for both across the whole app. They are separate
 * claims with separate mechanisms, so they are separate tests.
 *
 * THE TAP-OUT tested here is the WEB one — a document-level click listener
 * with an allow-list, ported from the suite. The NATIVE path is a different
 * mechanism entirely (components/EditExit: a Pressable ancestor, because a
 * touch on blank space does not bubble to `document` when there is no
 * document), and nothing in a browser can exercise it. That asymmetry has
 * already cost a round: the tap-out was reported as broken on the phone while
 * every browser test said it worked, because it had never worked there.
 *
 * THE NO-SHIFT test measures the boundingBox of a stable reference before and
 * after entering edit mode. Habits was the one that failed it: its grip used
 * `display: none`, so the grip, pencil and delete all APPEARED inside the name
 * column — and nameBox centres its text, so every habit name slid sideways as
 * edit mode opened. Measured x=68 out, x=48 in. Reminders and Notes reserve
 * that space; this screen did not. The slots are held open by spacers now
 * rather than by hidden controls, because an opacity-0 button is still read
 * out by a screen reader and still counts as visible to a test.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `em${Date.now()}${seq++}`;
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

/** Hold a row until its screen enters edit mode. */
async function longPress(page: Page, b: { x: number; y: number; width: number; height: number }) {
  await page.mouse.move(b.x + 15, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** A tap on empty space well away from any row or control. */
async function tapAway(page: Page) {
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width - 8, Math.round(vp.height * 0.75));
  await page.waitForTimeout(400);
}

async function makeReminder(page: Page) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('feed the cat');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(400);
}

async function makeNote(page: Page) {
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-back').click();
  await page.waitForTimeout(400);
}

async function makeHabit(page: Page) {
  await page.getByTestId('tab-habits').click();
  await page.getByTestId(/^habit-add-/).first().click();
  await page.getByTestId('habit-name-field').fill('Stretch');
  await page.getByTestId('habit-save').click();
  await page.waitForTimeout(500);
}

async function makeDayRow(page: Page) {
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('vet visit');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('day-tick').first()).toBeVisible({ timeout: 10_000 });
}

test('a tap outside leaves edit mode on reminders, notes and habits', async ({ page }) => {
  test.setTimeout(180_000);
  await signup(page);

  // The marker is a control that only EXISTS in edit mode, never a grip. The
  // grips on Reminders and Notes are always rendered and merely opacity-0 —
  // and Playwright counts an opacity-0 element as VISIBLE, so a grip-based
  // assertion here can neither pass nor fail honestly. That is how the first
  // version of this test read "still in edit mode" on a screen that had
  // already left it.
  // Pressed on the BODY, not the row: x+15 into a row lands on the tick, and
  // holding a checkbox does not open edit mode. dragunder.spec.ts presses the
  // body for the same reason.
  await makeReminder(page);
  await longPress(page, (await page.getByTestId('rem-body').first().boundingBox())!);
  await expect(page.getByTestId('rem-pencil').first(), 'reminders is in edit mode').toBeVisible();
  await tapAway(page);
  await expect(page.getByTestId('rem-pencil'), 'REMINDERS: a tap outside leaves edit mode').toHaveCount(0);

  await makeNote(page);
  await longPress(page, (await page.getByTestId('note-row').first().boundingBox())!);
  await expect(page.getByTestId('note-dup').first(), 'notes is in edit mode').toBeVisible();
  await tapAway(page);
  await expect(page.getByTestId('note-dup'), 'NOTES: a tap outside leaves edit mode').toHaveCount(0);

  await makeHabit(page);
  await longPress(page, (await page.getByTestId('habit-name').first().boundingBox())!);
  await expect(page.getByTestId('habit-grip').first(), 'habits is in edit mode').toBeVisible();
  await tapAway(page);
  await expect(page.getByTestId('habit-grip'), 'HABITS: a tap outside leaves edit mode').toHaveCount(0);
});

test("a tap outside leaves the calendar day panel's edit mode", async ({ page }) => {
  test.setTimeout(180_000);
  await signup(page);
  await makeDayRow(page);

  const controls = page.getByRole('button', { name: 'Duplicate' });
  await expect(controls, 'nothing parked before the gesture').toHaveCount(0);
  await page.getByText('vet visit').first().dblclick();
  await expect(controls.first(), 'the day panel is in edit mode').toBeVisible({ timeout: 5_000 });
  await tapAway(page);
  await expect(controls, 'and a tap outside leaves it').toHaveCount(0);
});

test('entering edit mode does not move anything', async ({ page }) => {
  test.setTimeout(180_000);
  await signup(page);

  // The reference on each screen is the thing your eye is on — the words —
  // not the row container, which can hold still while its contents slide.
  await makeReminder(page);
  const remRow = page.getByTestId('rem-row').first();
  const remBefore = (await remRow.boundingBox())!;
  await longPress(page, (await page.getByTestId('rem-body').first().boundingBox())!);
  const remAfter = (await remRow.boundingBox())!;
  expect(Math.round(remAfter.x), 'reminders row holds its place').toBe(Math.round(remBefore.x));
  await tapAway(page);

  await makeHabit(page);
  const habName = page.getByTestId('habit-name').first();
  const habBefore = (await habName.boundingBox())!;
  await longPress(page, habBefore);
  await expect(page.getByTestId('habit-grip').first(), 'really in edit mode').toBeVisible();
  const habAfter = (await habName.boundingBox())!;
  // THE ONE THAT FAILED: 68 -> 48 before the slots were reserved.
  expect(Math.round(habAfter.x), 'the habit name does not slide sideways').toBe(Math.round(habBefore.x));
  expect(Math.round(habAfter.width), 'and does not resize').toBe(Math.round(habBefore.width));
});
