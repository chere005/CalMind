import { expect, test, type Page } from '@playwright/test';

/**
 * The same button, twice, fast.
 *
 * A thumb double-taps constantly — on a slow page, on a bus, by accident.
 * Every spec clicks each control exactly once, so nothing has ever checked
 * that a second press inside a few milliseconds doesn't file a second copy.
 * The guards that would prevent it are incidental (a field clearing itself,
 * a screen navigating away) rather than deliberate, which is exactly the
 * shape of thing that works until it doesn't.
 */
let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `dt${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a double-tapped Done files one reminder, not two', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByPlaceholder(/Dentist/).fill('call the vet');
  // THREE presses as fast as the harness can manage, no awaiting between.
  // This used to rest on the screen navigating away and the field clearing,
  // which both happen a render later — so it passed on a fast machine and
  // flaked once, here, on a loaded one. The guard is explicit now: the same
  // line filed twice inside a second and a half is a thumb, not an intention.
  const done = page.getByText('Done', { exact: true });
  // The extra presses carry their OWN short timeout. A click() on a control
  // that has navigated away does not fail fast — it waits out the entire test
  // budget, so an unbounded .catch() here reads as a hang rather than as the
  // press it was meant to be. That is what a third click cost me.
  const spare = { timeout: 1_500 } as const;
  await Promise.all([
    done.click(),
    done.click(spare).catch(() => {}),
    done.click(spare).catch(() => {}),
  ]);
  await page.waitForTimeout(1_000);

  await page.getByTestId('tab-reminders').click();
  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'call the vet' }),
    'one press, one reminder',
  ).toHaveCount(1);
});

test('the guard is about a thumb, not a ban on repeating yourself', async ({ page }) => {
  // A guard that refused the same words forever would be its own bug: two
  // 'pay the sitter' reminders a minute apart is an ordinary thing to want.
  await signup(page);
  await page.getByTestId('tab-add').click();
  await page.getByPlaceholder(/Dentist/).fill('pay the sitter');
  await page.getByText('Done', { exact: true }).click();
  await page.waitForTimeout(1_600);
  await page.getByTestId('tab-add').click();
  await page.getByPlaceholder(/Dentist/).fill('pay the sitter');
  await page.getByText('Done', { exact: true }).click();
  await page.waitForTimeout(500);

  await page.getByTestId('tab-reminders').click();
  await expect(
    page.getByTestId('rem-row').filter({ hasText: 'pay the sitter' }),
    'asked twice, filed twice',
  ).toHaveCount(2);
});

test('a double-tapped section add makes one section, not two', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').first().click();
  const field = page.getByPlaceholder('New section');
  await field.fill('Chores');
  // Enter AND blur both commit — the pair that already caught Notes out once,
  // which is why addNote carries a committed-flag. This is the same shape.
  await field.press('Enter');
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('secadd-Chores'), 'one section, not two').toHaveCount(1);
});

test('a ticked row leaves at once, so there is nothing left to double-tap', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('buy milk');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'buy milk' });
  const tick = row.getByTestId('tick');
  // A toggle is the classic double-tap casualty: two fast taps put it back
  // where it started and the row sits there apparently ignoring you. It can't
  // happen here, and this says WHY rather than claiming a double-tap was
  // tested — the row hides on the first tick, so the second tap has nothing
  // under it. If completed rows ever stay visible, this is the guard that
  // quietly stops being one.
  await tick.click();
  await expect(row, 'a completed row hides immediately').toBeHidden();
});
