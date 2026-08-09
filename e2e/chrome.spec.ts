import { expect, test, type Page } from '@playwright/test';

/**
 * The top bar's invariants, on every screen and in every mode.
 *
 * Two regressions today were the same shape: a control that came and went, or
 * sat on the wrong side, and so shoved everything beside it. Sean saw it as
 * "all the button placement is broken", which is what a moving row looks like
 * from outside. Nothing was watching the header, so both landed without a
 * single test going red.
 *
 * These are the rules the suite holds to, and they are cheap to check:
 *   · back is LEFT of the title and VISIBLE — always, on every screen. The
 *     suite emits it unconditionally, straight onto history.back(), with no
 *     test for whether there is anywhere to go;
 *   · a screen that has a picker keeps it in every view mode;
 *   · the username pill is always there, being the way into Settings.
 */
async function signup(page: Page): Promise<string> {
  const user = `chr${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  return user;
}

const TITLES: Record<string, string> = {
  reminders: 'Reminders', calendar: 'Calendar', notes: 'Notes', habits: 'Habits', add: 'Add',
};

/** The screens whose content is scoped by a picker, so the picker is not optional. */
const SCOPED: Record<string, string> = {
  reminders: 'pick-reminders', calendar: 'pick-calendar', notes: 'pick-notes', habits: 'pick-habits',
};

test('back sits left of the title on every screen', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);
  const width = page.viewportSize()!.width;

  for (const [tab, title] of Object.entries(TITLES)) {
    await page.getByTestId(`tab-${tab}`).click();
    await page.waitForTimeout(250);
    await expect(page.getByTestId('nav-back'), `${tab}: back is drawn, not just present`).toBeVisible();
    const back = await page.getByTestId('nav-back').boundingBox();
    const head = await page.getByText(title, { exact: true }).first().boundingBox();
    expect(back, `${tab}: the back slot exists`).not.toBeNull();
    expect(head, `${tab}: the title is drawn`).not.toBeNull();
    expect(back!.x, `${tab}: back is left of "${title}"`).toBeLessThan(head!.x);

    // Left of the title is necessary but weak: a back control adrift in the
    // middle of the row satisfies it. It belongs against the margin, which is
    // 16, so past ~64 it has stopped being the first thing in the row.
    expect(back!.x, `${tab}: back sits against the left margin, not floating inward`).toBeLessThan(64);
    expect(back!.x + back!.width, `${tab}: back finishes before the title starts`).toBeLessThanOrEqual(head!.x + 1);

    // The right-hand cluster: picker then username, both on screen. A control
    // pushed past the edge is unreachable, not merely untidy.
    const who = await page.getByText(user, { exact: true }).first().boundingBox();
    expect(who, `${tab}: the username is in the bar`).not.toBeNull();
    expect(who!.x, `${tab}: the username is past the title`).toBeGreaterThan(head!.x);
    expect(who!.x + who!.width, `${tab}: the username is not pushed off-screen`).toBeLessThanOrEqual(width);

    const pickId = SCOPED[tab];
    if (pickId) {
      const pick = page.getByTestId(pickId);
      await expect(pick, `${tab}: this screen is scoped by a picker, so the picker shows`).toBeVisible();
      const p = (await pick.boundingBox())!;
      expect(p.x, `${tab}: the picker is in the right-hand cluster`).toBeGreaterThan(head!.x);
      expect(p.x, `${tab}: the picker comes before the username`).toBeLessThan(who!.x);
      expect(p.x + p.width, `${tab}: the picker is not pushed off-screen`).toBeLessThanOrEqual(width);
      // It draws a 32px ring; a 16px pie inside one is a button half the size
      // it looks, which is what it was until the ring became the target.
      expect(
        Math.min(p.width, p.height),
        `${tab}: the picker is as big as the ring it draws`,
      ).toBeGreaterThanOrEqual(26);
    }
  }
});

test('the picker and the username survive a change of view mode', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const user = await signup(page);

  // Month.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('pick-calendar')).toBeVisible();
  await expect(page.getByText(user, { exact: true }).first()).toBeVisible();

  // Week — the mode that was quietly stripping chrome. It is entered by a
  // swipe on the grid, and it persists under this key, which is steadier to
  // set than a gesture is to simulate.
  await page.evaluate(() => window.localStorage.setItem('calmind.calWeekMode', '1'));
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('pick-calendar'), 'the picker does not belong to one view mode').toBeVisible();
  await expect(page.getByText(user, { exact: true }).first()).toBeVisible();
});

test('a fortnight of marks comes with a legend to read them by', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByText('Event', { exact: true }).click();
  await page.getByPlaceholder(/Dentist/).fill('dinner today');
  await page.getByText('Done', { exact: true }).click();
  await page.waitForTimeout(600);

  await page.evaluate(() => window.localStorage.setItem('calmind.calWeekMode', '1'));
  await page.reload();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId('legend-me'),
    'week mode had the names all along and simply did not draw them',
  ).toBeVisible();
});
