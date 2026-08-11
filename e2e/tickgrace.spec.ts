import { expect, test, type Page } from '@playwright/test';

/**
 * Two seconds to change your mind about a tick.
 *
 * Sean, 2026-08-11: "when checking off a reminder in all apps, make sure to
 * show the checked reminder for 2 seconds, giving the user the ability to
 * uncheck it if checking it was a mistake". Ticking marks a reminder done and
 * every list filters done items out, so the row used to vanish under the
 * finger — a mis-tap left nothing to correct except by turning on Completed
 * and going to find it.
 *
 * BOTH halves are checked here. That it lingers is half a feature; that it
 * eventually goes is the other half, and a grace period that never ended
 * would pass a test written only for the first.
 */
async function signup(page: Page): Promise<string> {
  const user = `tg${String(Date.now()).slice(-7)}`;
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

async function addReminder(page: Page, text: string) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId(/^secadd-/).first().click();
  const field = page.getByPlaceholder('New reminder').first();
  await field.fill(text);
  await field.press('Enter');
  await expect(page.getByText(text)).toBeVisible();
}

test('a ticked reminder stays for two seconds, and can be unticked in them', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await addReminder(page, 'take the bins out');

  await page.getByTestId('tick').first().click();

  // Still there, and visibly ticked — not merely still in the DOM.
  await expect(page.getByText('take the bins out'), 'the row stays put after the tick').toBeVisible();
  await expect(page.getByTestId('tick').first().getByText('✓'), 'and shows as ticked').toBeVisible();

  // The whole point: tap it again and the mistake is undone.
  await page.getByTestId('tick').first().click();
  await expect(page.getByTestId('tick').first().getByText('✓'), 'the tick is gone again').toHaveCount(0);

  // …and it is still there afterwards, because it is no longer done at all.
  await page.waitForTimeout(2_400);
  await expect(page.getByText('take the bins out'), 'unticking keeps it for good').toBeVisible();
});

test('…and after the two seconds it goes, or the grace never ends', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await addReminder(page, 'water the ferns');

  await page.getByTestId('tick').first().click();
  await expect(page.getByText('water the ferns')).toBeVisible();

  // The half that makes the other half mean something.
  await expect(page.getByText('water the ferns'), 'the row leaves once the grace expires').toHaveCount(0, {
    timeout: 8_000,
  });

  // And it really was completed, not discarded — Completed still holds it.
  await page.getByRole('button', { name: 'Completed' }).click();
  await expect(page.getByText('water the ferns'), 'it was ticked, not lost').toBeVisible();
});
