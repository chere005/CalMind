/**
 * The habits picker's All row wears the rainbow, like the other three.
 *
 * Sean, 2026-08-12. Reminders, Notes and the Calendar all draw the suite's
 * conic rainbow against All; habits drew a pie of its own section colours, so
 * on a fresh account — one section — "All" was a single flat disc that looked
 * exactly like that one section.
 *
 * The check counts PATHS rather than looking at colour. PieDot draws the
 * rainbow as 48 wedges and an ordinary pie as one per colour, so the two are
 * far apart and a fresh account (few sections) makes the gap unmistakable.
 * Reading pixels would be the alternative and is worse: an anti-aliased seam
 * colour is exactly the sort of assertion that passes for the wrong reason.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `hr${Date.now()}${seq++}`;
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

test('the All row draws the rainbow, not a one-colour pie', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByTestId('pick-habits').click();

  const allWedges = await page.getByTestId('msec-all').locator('path').count();
  expect(allWedges, 'the rainbow is 48 wedges; a plain pie is one per section').toBeGreaterThan(8);

  // And a SECTION row is not a rainbow, or the assertion above would pass on
  // a picker that had simply drawn everything the same way.
  const secRow = page.getByTestId(/^msec-only-/).first();
  const secWedges = await secRow.locator('path').count();
  expect(secWedges, 'a single section keeps its own flat colour').toBeLessThan(8);
});
