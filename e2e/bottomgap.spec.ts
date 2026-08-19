import { expect, test } from '@playwright/test';

/**
 * The `100dvh` fix for the gap under the tab bar is still in the page.
 *
 * Sean reported a gap that DIFFERED by screen — ~60pt on Calendar, ~102pt on
 * Reminders — which is what made it read as a layout bug rather than a margin.
 * The fix was `height: 100dvh` behind an @supports, patched in at export
 * (tools/patch-web-html.mjs, the `calmind-vh` block): the reset's `height:
 * 100%` resolves against the LARGE viewport under viewport-fit=cover, so in a
 * Safari tab the app lays out taller than what is visible and the toolbar's
 * collapse makes the error vary per screen.
 *
 * IT SHIPPED UNVERIFIED, for a reason that has since stopped being true —
 * "both web surfaces sit behind the login wall", when this suite signs up
 * freely. So it was measured on 2026-08-11, at 390x844, signed in:
 *
 *     every screen: root = scroll = body = innerHeight = 844,
 *     and the gap under the bar is 9px on ALL FOUR screens.
 *
 * Uniform, and no overflow — the symptom is gone here.
 *
 * THOSE MEASUREMENTS ARE NOT A TEST, and were deleted rather than left green.
 * A headless browser has no collapsing toolbar, so 100% and 100dvh resolve
 * identically and the fault cannot be reproduced; the app's shell is
 * viewport-height by construction, and its content scrolls, so "root == the
 * viewport" and "the gap is uniform" hold whatever the fix does. Both were
 * written, both passed with the dvh block REMOVED, and a check that cannot
 * fail is worse than no check.
 *
 * What is left is the one thing that can go wrong silently and be caught here:
 * the patched style disappearing from the export.
 *
 * AND THE OTHER HALF OF THE BUG, found 2026-08-19 by installing the app as a
 * webclip on the iOS 26 simulator: STANDALONE is not the mode where "nothing
 * moves" — WebKit sizes dvh (812/820 of an 874 screen, varying by launch) and
 * svh as if Safari's chrome existed, and only lvh answers the true screen. An
 * app pinned to dvh sat 62pt short, tab bar floating over a dead band — the
 * reported gap, reproduced at last. The fix pins html/body/#root to 100lvh
 * under `display-mode: standalone` (measured matching in a webclip). Verified
 * on the simulator: rootH 812 → 874 across the change. A headless browser is
 * never in standalone display-mode, so like the dvh half only the style's
 * PRESENCE can be checked here.
 */
test('the dvh fix is still in the page it is patched into', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('.');
  // A patched <style>, not app code — nothing else would notice it going
  // missing, and an export that stopped emitting it would be silent.
  const style = await page.evaluate(() => document.getElementById('calmind-vh')?.textContent ?? '');
  expect(style, 'the calmind-vh block is served').toContain('100dvh');
  expect(style, 'and it stays behind @supports, so a browser without dvh keeps its height').toContain('@supports');
  expect(style, 'and the standalone half pins the app to the large viewport, where dvh lies').toContain(
    '@media (display-mode: standalone){html,body{height:100lvh}#root{height:100lvh}}',
  );
});
