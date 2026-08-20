/**
 * The day panel's reminder circle: the suite's small scale, sitting level.
 *
 * Sean, 2026-08-20: "the circle for the reminder got too big and is off on
 * the calendar app". It was 22px — nearly the main reminders list's 24 —
 * where the suite draws the day panel's check at 17px (.dp-check,
 * calendar/index.php): the panel is the SMALL scale, and the circle had
 * drifted to the big one. 18 now, and pinned, because a size that drifts
 * once drifts again.
 *
 * "Off" is the other half: the circle must sit centred on its row's text,
 * measured as two independent boxes — an offset from the circle's own edge
 * would land inside it whatever its size (CLAUDE.md's rule).
 */
import { expect, test, type Page } from '@playwright/test';

async function signup(page: Page) {
  const user = `dt${Date.now()}${Math.floor(Math.random() * 999)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

test('the day-panel tick is the small scale, and level with its words', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);

  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-add').click();
  await page.getByTestId('add-kind-reminder').click();
  await page.getByTestId('add-text').fill('water the plants');
  await page.getByText('Done', { exact: true }).click();

  const tick = page.getByTestId('day-tick').first();
  await expect(tick).toBeVisible({ timeout: 10_000 });
  const t = (await tick.boundingBox())!;
  expect(Math.round(t.width), 'the suite’s day-panel scale, not the list’s 24').toBe(18);
  expect(Math.round(t.height)).toBe(18);

  // Level: the circle's centre and the row text's centre agree within a
  // pixel of rounding — two boxes, compared to each other.
  const text = (await page.getByText('water the plants', { exact: true }).boundingBox())!;
  const tickMid = t.y + t.height / 2;
  const textMid = text.y + text.height / 2;
  expect(Math.abs(tickMid - textMid), `circle mid ${tickMid} vs text mid ${textMid}`)
    .toBeLessThanOrEqual(1.5);

  // The main reminders list keeps its OWN scale — 24, the suite's .check —
  // so the two circles stay two deliberate sizes, not one drifting value.
  await page.getByTestId('tab-reminders').click();
  const listTick = (await page.getByTestId('tick').first().boundingBox())!;
  expect(Math.round(listTick.width)).toBe(24);
});
