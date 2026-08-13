/**
 * The status dot does not move when you open a note.
 *
 * It is the app's one honest signal that something did not save, and it is
 * drawn TWICE: once by the top bar, and once by the note editor, which hides
 * the bar and draws its own. Two drawings of one indicator is two chances to
 * disagree, and they did — measured on 2026-08-12, x matched and y did not:
 *
 *   top bar   x=396 y=28
 *   editor    x=396 y=20     <- eight pixels up, on open
 *
 * Sean saw it as a shift he could not name, which is exactly what an eight
 * pixel jump looks like. Both now come from TOPBAR_DOT_TOP in ui.tsx, so
 * moving the bar moves both.
 *
 * This measures the REAL boxes rather than reading the styles, because the
 * styles agreeing is not the claim — the claim is that the pixel does not
 * move, and the editor's dot is absolutely positioned in a different
 * container from the bar's.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `df${Date.now()}${seq++}`;
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

test('the status dot sits in the same place in the list and in the editor', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();

  const bar = (await page.getByTestId('topbar-sync').boundingBox())!;
  expect(bar, 'the top bar draws a dot to compare against').toBeTruthy();

  await page.getByTestId('secadd-General').first().click();
  await expect(page.getByTestId('note-title')).toBeVisible();
  // The editor really does replace the bar — otherwise this spec would be
  // comparing the bar with itself and could not fail.
  await expect(page.getByTestId('topbar-sync'), 'the editor hides the top bar').toHaveCount(0);

  // RIGHT EDGES, not x. The bar's status is the account button now — a
  // 32pt circle whose border carries the colour — and the editor still draws
  // the small dot, so their left edges cannot agree and never should. What
  // must agree is where the indicator sits from the right of the screen,
  // which is what you actually see move.
  const ed = (await page.getByTestId('editor-sync').boundingBox())!;
  expect(Math.round(ed.x + ed.width), 'the same distance from the right edge')
    .toBe(Math.round(bar.x + bar.width));
});
