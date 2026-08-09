import { expect, test } from '@playwright/test';

/**
 * The page says what went wrong, on a device with no console.
 *
 * A blank dark screen is all a failed render looks like from outside, and an
 * installed home-screen web app gives you nothing else to go on — there is no
 * console and none can be attached from here. So the head carries a listener
 * that paints the error across the screen.
 *
 * Both halves are checked because the interesting one is easy to get wrong: a
 * <script> that 404s does NOT bubble an error to window and carries no
 * message, so a bubble-phase listener watches that failure in complete
 * silence. Which is exactly the case worth catching, since a cached page
 * pointing at a bundle that is no longer on the server looks like a blank
 * screen and nothing else.
 */
test('a thrown error is painted on the page', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { setTimeout(() => { throw new Error('kaboom from a timer'); }, 0); });
  const shout = page.getByTestId('fatal-error');
  await expect(shout).toBeVisible({ timeout: 5_000 });
  await expect(shout).toContainText('CalMind could not start');
  await expect(shout).toContainText('kaboom from a timer');
});

test('a script that will not load is named, not suffered in silence', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = '/test/calmind/_expo/static/js/web/index-doesnotexist.js';
    document.body.appendChild(s);
  });
  const shout = page.getByTestId('fatal-error');
  await expect(shout, 'a 404 script does not bubble and has no message').toBeVisible({ timeout: 5_000 });
  await expect(shout).toContainText('failed to load');
  await expect(shout).toContainText('index-doesnotexist.js');
});

test('an ordinary page paints nothing at all', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('fatal-error')).toHaveCount(0);
});
