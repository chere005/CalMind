import { expect, test } from '@playwright/test';

/**
 * The Copy-as-Markdown button, which used to answer nothing at all.
 *
 * It is Sean's own tool — the suite shows it only on his account — and it
 * gave no sign either way: no "copied", and a refusal swallowed whole. A
 * browser will refuse the clipboard for ordinary reasons, chiefly a page it
 * has decided is not focused. A button with no answer is a button you press
 * twice, and then wonder what you pasted.
 */
test('the copy button says whether it copied', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The control is his alone, so the account has to be his name.
  const user = 'sean';
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  // The name may already be taken by an earlier run on this scratch server;
  // either way we need to end up signed in as it.
  //
  // WAIT FOR THE OUTCOME before deciding. Signing up is a round trip, and
  // asking "is the username field still there?" the instant after the click
  // is a race the login screen always wins — so this took the "name taken"
  // branch while the account was in the middle of being created, and then
  // drove a form that was about to be replaced. It passed anyway, by luck,
  // for as long as clicking a control Playwright considered unclickable was a
  // silent no-op. Give the request its answer first.
  const signedIn = await page.getByTestId('tab-reminders')
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!signedIn) {
    await page.getByText('Sign in', { exact: true }).first().click({ timeout: 2_000 }).catch(() => {});
    await page.getByPlaceholder('Username').fill(user);
    await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
    await page.getByText('Sign in', { exact: true }).click();
  }
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('buy milk');
  await page.getByTestId('rem-add-field').press('Enter');

  await page.getByTestId('rem-copymd').click();
  await expect(page.getByTestId('rem-copynote'), 'it answers').toContainText('Copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip, 'and the list is what landed there').toContain('- [ ] buy milk');
});
