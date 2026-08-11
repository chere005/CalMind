import { expect, test, type Page } from '@playwright/test';

/**
 * The app at DESKTOP width.
 *
 * Every other spec runs at 420×900, so the only width the suite has ever seen
 * is a phone's — while the Tauri shell ships a window at 1160×800 around this
 * exact bundle, and Sean uses the site in a browser. A layout that only breaks
 * wide had nothing watching it.
 *
 * This is deliberately about SHAPE, not pixels: the column stays centred and
 * bounded rather than smearing across the window, habits show the full week
 * that width earns, and nothing overflows sideways.
 */
const DESKTOP = { width: 1160, height: 800 };

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `desk${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('the app at the width the desktop shell actually ships', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const user = await signup(page);

  // The reading column is bounded and centred — the suite's 640px rule. A
  // full-bleed list across a 1160px window is the failure here.
  const body = page.getByTestId('page-root');
  const box = (await body.boundingBox())!;
  expect(box.width).toBeCloseTo(DESKTOP.width, 0);
  const grid = (await page.getByTestId('cal-grid').boundingBox())!;
  expect(grid.width, 'the calendar column stays a column').toBeLessThanOrEqual(700);
  expect(grid.x, 'and it is centred, not pinned left').toBeGreaterThan(100);

  // The picker is here at THIS width too. Deliberately the only header claim
  // this spec makes: back and the username sit inside the column because the
  // header shares one bounded box with the content (App.tsx `s.body`,
  // maxWidth 640), which is exactly what "the calendar column stays a column"
  // above already guarantees — asserting their positions again would be a
  // check that cannot fail. Whether the picker is DRAWN is a separate
  // question, and one a width-gated regression could answer wrongly; that is
  // how it went missing before.
  await expect(page.getByTestId('pick-calendar'), 'the picker is drawn at desktop width').toBeVisible();

  // Nothing spills sideways: the document never scrolls horizontally.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no sideways scroll at desktop width').toBeLessThanOrEqual(0);

  // Habits earns the whole week at this width — the breakpoint Sean asked for
  // cuts to five on a phone and must not cut here.
  await page.getByTestId('tab-habits').click();
  await page.getByTestId('habit-add-Habits').first().click();
  await page.getByTestId('habit-name-field').fill('stretch');
  await page.getByTestId('habit-save').click();
  await expect.poll(() => page.getByTestId('habit-daycol').count()).toBe(7);

  // And every screen opens wide without throwing.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const tab of ['tab-notes', 'tab-reminders', 'tab-calendar']) {
    await page.getByTestId(tab).click();
    await page.waitForTimeout(250);
  }
  expect(errors, 'no page errors at desktop width').toEqual([]);
});
