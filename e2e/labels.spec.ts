import { expect, test } from '@playwright/test';

/**
 * Icon-only controls say what they are.
 *
 * The suite gives every one of them an aria-label — "Back", "Completed",
 * "Add subtask", "Make it a task again". This app had none at all, so the
 * whole bottom bar and the top-left back read to a screen reader as unlabelled
 * buttons, and a glyph like "‹" read aloud is no use to anybody.
 *
 * accessibilityLabel becomes aria-label under react-native-web, so this is
 * checkable in the same run as everything else.
 */
test('the tab bar and the back control are named, not just drawn', async ({ page }) => {
  test.setTimeout(60_000);
  const user = `lbl${String(Date.now()).slice(-6)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  for (const [tab, name] of Object.entries({
    reminders: 'Reminders', calendar: 'Calendar', add: 'Add', notes: 'Notes', habits: 'Habits',
  })) {
    await expect(
      page.getByTestId(`tab-${tab}`),
      `the ${tab} tab says its name`,
    ).toHaveAttribute('aria-label', name);
  }

  await expect(page.getByTestId('nav-back')).toHaveAttribute('aria-label', 'Back');
});
