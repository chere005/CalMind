import { expect, test, type Page } from '@playwright/test';

/**
 * The username menu hangs off the username, not off the window.
 *
 * Sean, 2026-08-11, with a screenshot: "settings menu is randomly off to the
 * side on web and macos". It was `right: 16` inside its Modal — sixteen pixels
 * from the edge of the WINDOW. The app is a 640px centred column, so on any
 * window wider than that the menu appeared far to the right of the pill that
 * opened it. It looked random because it depended on the window width.
 *
 * Checked at a WIDE size, because at phone width the two positions coincide
 * and the bug is invisible — which is exactly why nothing caught it.
 */
async function signedIn(page: Page): Promise<string> {
  const user = `mn${String(Date.now()).slice(-7)}`;
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

for (const width of [1440, 1160, 390]) {
  test(`the menu sits under the username at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 800 });
    const user = await signedIn(page);

    const pill = (await page.getByText(user, { exact: true }).first().boundingBox())!;
    await page.getByTestId('topbar-sync').click();
    const menu = (await page.getByText('Log out', { exact: true }).boundingBox())!;

    // Its right edge tracks the pill's, rather than the window's.
    expect(
      Math.abs((menu.x + menu.width) - (pill.x + pill.width)),
      'the menu is right-aligned with the username, not with the window',
    ).toBeLessThan(60);

    // And it hangs BELOW the pill, not level with it or above.
    expect(menu.y, 'the menu opens under the pill').toBeGreaterThan(pill.y);

    // On screen at all — a menu pushed past the edge is unusable.
    expect(menu.x, 'not off the left edge').toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width, 'not off the right edge').toBeLessThanOrEqual(width);
  });
}
