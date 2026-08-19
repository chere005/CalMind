import { expect, test } from '@playwright/test';

/**
 * The page says what went wrong, on a device with no console — but ONLY while
 * there is nothing else on screen to say it.
 *
 * A blank dark screen is all a failed render looks like from outside, and an
 * installed home-screen web app gives you nothing else to go on — there is no
 * console and none can be attached from here. So the head carries a listener
 * that paints the error across the screen.
 *
 * It stands down once the app has rendered. The first version stayed armed
 * forever, and iOS fires a scrubbed "Script error. :0" at the page when the
 * share sheet opens over it — so sharing the app's own URL painted "CalMind
 * could not start" over an app that was running fine (seen twice on the
 * simulator, 2026-08-19, webclip and Safari both). A late error in a rendered
 * app is the app's to surface; this screen exists for the boot that never
 * drew anything, which is the one case with no other voice.
 *
 * The empty-root state is simulated by emptying #root before throwing: this
 * suite cannot make the real bundle fail to boot on demand, and what the
 * guard actually reads is "has anything rendered", which is exactly what is
 * being emptied.
 */
test('an error before anything rendered is painted on the page', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    document.getElementById('root')!.replaceChildren();
    setTimeout(() => { throw new Error('kaboom from a timer'); }, 0);
  });
  const shout = page.getByTestId('fatal-error');
  await expect(shout).toBeVisible({ timeout: 5_000 });
  await expect(shout).toContainText('CalMind could not start');
  await expect(shout).toContainText('kaboom from a timer');
});

test('a script that will not load is named, not suffered in silence', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    document.getElementById('root')!.replaceChildren();
    const s = document.createElement('script');
    s.src = '/test/calmind/_expo/static/js/web/index-doesnotexist.js';
    document.body.appendChild(s);
  });
  const shout = page.getByTestId('fatal-error');
  await expect(shout, 'a 404 script does not bubble and has no message').toBeVisible({ timeout: 5_000 });
  await expect(shout).toContainText('failed to load');
  await expect(shout).toContainText('index-doesnotexist.js');
});

test('an error AFTER the app rendered paints nothing over it', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  // The share-sheet shape: the app is up, and a stray error arrives.
  await page.evaluate(() => { setTimeout(() => { throw new Error('late and harmless'); }, 0); });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('fatal-error')).toHaveCount(0);
  // The app is still standing, not replaced by a fatal screen.
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
});

test('a shout painted BEFORE the render retracts when the render arrives', async ({ page }) => {
  // The desktop shell's race (Sean, 2026-08-19): a scrubbed error fires on
  // every boot, and on a big account it lands before the first paint — the
  // fatal screen painted, and the app finished booting UNDERNEATH it,
  // covered forever. The screen's claim is "could not start"; a render
  // arriving afterwards falsifies it, and the screen must take itself down.
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const root = document.getElementById('root')!;
    const kids = [...root.childNodes];
    root.replaceChildren(); // boot not yet drawn
    setTimeout(() => { throw new Error('early and scrubbed-ish'); }, 0);
    // The app "finishes booting" a moment later.
    setTimeout(() => { for (const k of kids) root.appendChild(k); }, 400);
  });
  await expect(page.getByTestId('fatal-error')).toBeVisible({ timeout: 2_000 });
  await expect(page.getByTestId('fatal-error')).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible();
});

test('an ordinary page paints nothing at all', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByText('Sign in', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('fatal-error')).toHaveCount(0);
});
