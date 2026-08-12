/**
 * The workaround that makes an 11-pixel control tappable, proven to work.
 *
 * `hitSlop` is a NO-OP under react-native-web. CLAUDE.md carries that as one
 * of the traps that has cost real time here, because it fails in the direction
 * that hurts: the native builds get the bigger target, the web does not, and
 * nothing says so. `WebHitSlop` in ui.tsx is the answer — an absolutely
 * positioned child inset by `-slop` on every side, rendered on web only — and
 * it is used in 36 places across 13 files.
 *
 * Nothing tested that it does anything at all. It could be deleted, or have
 * its `Platform.OS !== 'web'` inverted, or lose its negative offsets, and every
 * existing spec would stay green: Playwright clicks element CENTRES, which land
 * inside the drawn box whether the pad is there or not.
 *
 * The subject is the habit section's colour swatch, which is the honest one to
 * pick: 11×11 drawn, `slop={10}`, and its own comment in Habits.tsx says "the
 * only control in the app that small… the slop is what makes it tappable."
 * If the pad stops working, that control becomes an 11-pixel target and the
 * only symptom is Sean missing it and trying again.
 *
 * MEASURED FROM THE CENTRE OUTWARD, by a distance that can be justified,
 * because CLAUDE.md is equally clear that an offset from an element's own edge
 * is not a check — it lands inside whatever the size is, so it passes with the
 * bug present and absent alike:
 *
 *   · the box is 11px, so its edge is 5.5px from the centre;
 *   · 13px out is therefore 7.5px BEYOND the drawn edge and inside the slop
 *     of 10 — it must press;
 *   · 20px out is 14.5px beyond the edge and outside the slop — it must NOT.
 *
 * Both directions matter. Without the second, "the pad is enormous" and "the
 * pad is right" look identical.
 *
 * Vertically, deliberately. Directly right of the dot sits `hsec-name`, so a
 * horizontal probe would land on a neighbour and report its behaviour instead
 * — checked with elementFromPoint rather than assumed.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `ws${Date.now()}${seq++}`;
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

const colour = (page: Page) =>
  page.getByTestId('hsec-dot-Habits').evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);

/** Click `dy` pixels from the swatch's CENTRE, vertically. */
async function clickFromCentre(page: Page, dy: number) {
  const box = (await page.getByTestId('hsec-dot-Habits').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
  await page.waitForTimeout(300);
}

test('the web hit pad reaches past the drawn edge, and stops', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await expect(page.getByTestId('hsec-dot-Habits')).toBeVisible();

  // The drawn size is the premise of every distance below, so assert it rather
  // than trust it. A restyled swatch should fail here and be re-reasoned, not
  // silently change what the other assertions mean.
  const box = (await page.getByTestId('hsec-dot-Habits').boundingBox())!;
  expect(Math.round(box.width), 'the swatch is drawn 11px wide').toBe(11);
  expect(Math.round(box.height), 'the swatch is drawn 11px tall').toBe(11);

  const start = await colour(page);

  // 13px above the centre: 7.5px outside the drawn box, inside the slop of 10.
  await clickFromCentre(page, -13);
  const afterInside = await colour(page);
  expect(afterInside, 'a press 7.5px outside the drawn edge must still land').not.toBe(start);

  // 13px below, the other side of the same pad.
  await clickFromCentre(page, 13);
  const afterBelow = await colour(page);
  expect(afterBelow, 'the pad reaches below as well as above').not.toBe(afterInside);

  // 20px above: 14.5px outside, past a slop of 10. Nothing should happen —
  // without this the test would pass just as well if the pad were unbounded.
  await clickFromCentre(page, -20);
  expect(await colour(page), 'a press beyond the slop must NOT reach the swatch').toBe(afterBelow);
});
