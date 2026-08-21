import { test, expect, type Page } from '@playwright/test';

/**
 * The calendar's THIRD view (Sean, 2026-08-20: "swiping up again should go to
 * a list view of events, reminders, notes, grouped by day.. similar to widget
 * but controlable by the folder picker.. go out 3 months by default").
 *
 * Up folds month → fortnight → list; down opens it back out. The list is the
 * widget's shape with the picker's filtering, which is the half worth pinning:
 * a view that ignored the picker would look right on a fresh account and be
 * wrong on Sean's, where switching a calendar off is how he reads the month.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `cl${Date.now()}${seq++}`;
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

/** A firm vertical drag on whichever surface is showing. */
async function swipe(page: Page, up: boolean) {
  const box = (await page.getByTestId('cal-grid').or(page.getByTestId('cal-list')).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (up ? -1 : 1) * i * 12);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function addEvent(page: Page, line: string) {
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-event').click();
  await page.getByTestId('add-text').fill(line);
  await page.getByText('Done', { exact: true }).click();
}

test('a second swipe up reaches the list, and a swipe down walks back', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addEvent(page, 'Dentist tomorrow 2pm');
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 10_000 });

  // month → fortnight: still a grid, and the day panel is still there.
  await swipe(page, true);
  await expect(page.getByTestId('cal-grid'), 'the fortnight is still the grid').toBeVisible();
  await expect(page.getByTestId('cal-list')).toHaveCount(0);

  // fortnight → list: the grid, the legend and the panel go together.
  await swipe(page, true);
  await expect(page.getByTestId('cal-list')).toBeVisible();
  await expect(page.getByTestId('cal-grid'), 'the grid is gone').toHaveCount(0);
  await expect(page.getByTestId('cal-day-title'), 'and so is the day panel').toHaveCount(0);

  // A THIRD swipe up does nothing — clamped, not wrapped round to the month.
  await swipe(page, true);
  await expect(page.getByTestId('cal-list'), 'still the list').toBeVisible();

  // …and down walks back out, one step at a time.
  await swipe(page, false);
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await swipe(page, false);
  await expect(page.getByTestId('cal-grid')).toBeVisible();
});

test('the list groups by day and reaches three months out', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addEvent(page, 'Dentist tomorrow 2pm');
  // Two months away — inside the three-month window, far outside a fortnight.
  const far = new Date(Date.now() + 60 * 86_400_000);
  await addEvent(page, `Conference ${far.getMonth() + 1}/${far.getDate()} 9am`);

  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 10_000 });
  await swipe(page, true);
  await swipe(page, true);
  await expect(page.getByTestId('cal-list')).toBeVisible();

  await expect(page.getByText('Dentist')).toBeVisible();
  await expect(page.getByText('Conference'), 'two months out is inside the window').toBeVisible();
  // One heading per day that has something, not one per day in the range.
  const days = await page.getByTestId('cal-list-day').count();
  expect(days, 'only days with something on them').toBe(2);
});

test('the picker filters the list, exactly as it filters the grid', async ({ page }) => {
  // The half that makes this the calendar's list rather than the widget's:
  // switching a calendar off has to empty it here too.
  test.setTimeout(120_000);
  await signup(page);
  await addEvent(page, 'Dentist tomorrow 2pm');
  await page.getByTestId('tab-calendar').click();
  await swipe(page, true);
  await swipe(page, true);
  await expect(page.getByText('Dentist')).toBeVisible();

  await page.getByTestId('pick-calendar').click();
  await page.getByTestId(/^calbox-/).first().click();
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 300);
  await page.waitForTimeout(400);

  await expect(page.getByTestId('cal-list'), 'still in the list view').toBeVisible();
  await expect(page.getByText('Dentist'), 'the switched-off calendar leaves the list').toHaveCount(0);
});

test('the view is remembered, like the fortnight always was', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  await swipe(page, true);
  await swipe(page, true);
  await expect(page.getByTestId('cal-list')).toBeVisible();

  // A tab switch unmounts the screen; a reload rebuilds the app. Both.
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-list'), 'survives a tab switch').toBeVisible();
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-list'), 'and a reload').toBeVisible({ timeout: 20_000 });
});

test('the headings are the widget\'s: TODAY, then weekdays, with the date', async ({ page }) => {
  // Sean, 2026-08-20: "needs headers showing dates, similar to the widget".
  // The widget writes TODAY · AUG 21 and FRI · AUG 22 — uppercase, a middle
  // dot, no comma. toLocaleDateString punctuates it "Fri, Aug 22", and a
  // heading that is ALMOST the widget's is worse than one plainly different.
  test.setTimeout(120_000);
  await signup(page);
  await addEvent(page, 'Dentist tomorrow 2pm');
  await addEvent(page, 'Standup 9am');
  await page.getByTestId('tab-calendar').click();
  await swipe(page, true);
  await swipe(page, true);

  const heads = await page.getByTestId('cal-list-head').allInnerTexts();
  expect(heads.length, 'today and tomorrow both have a heading').toBeGreaterThanOrEqual(2);
  expect(heads[0], "today is named, not dated as a weekday").toMatch(/^TODAY · [A-Z]{3} \d{1,2}$/);
  expect(heads[1], 'and the next day is its weekday').toMatch(/^[A-Z]{3} · [A-Z]{3} \d{1,2}$/);
  for (const h of heads) expect(h, 'no commas anywhere').not.toContain(',');
});

test('a day heading takes you to that day in the month', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await addEvent(page, 'Dentist tomorrow 2pm');
  await page.getByTestId('tab-calendar').click();
  await swipe(page, true);
  await swipe(page, true);
  await page.getByTestId('cal-list-head').first().click();

  // Back to the month, on the day that was tapped — the list is a way in,
  // not a dead end.
  await expect(page.getByTestId('cal-grid')).toBeVisible();
  await expect(page.getByTestId('cal-day-title')).toBeVisible();
  await expect(page.getByTestId('dp-ev-body').filter({ hasText: 'Dentist' })).toBeVisible();
});
