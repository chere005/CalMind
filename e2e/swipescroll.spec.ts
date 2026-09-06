/**
 * A swipe must not scroll the list under it — Sean, 2026-09-06: "don't allow
 * scrolling during any swipe gesture in all apps".
 *
 * On native the row's PanResponder claims the gesture and refuses to yield the
 * responder to the enclosing ScrollView (swiperow.ts), so a swipe never
 * scrolls. On the web build there is no such arbitration: the browser decides,
 * and it decides from `touch-action`. A swipeable row is `touch-action: pan-y`,
 * which permits the browser only VERTICAL panning — so a clearly horizontal
 * swipe is handed to JS and the page cannot scroll during it, while an ordinary
 * up/down drag still scrolls the list.
 *
 * The harness runs a mouse, not a finger, so it cannot feel the scroll lock;
 * what it CAN check is that the property that produces it is on the row. That
 * is the wiring this asserts — the behaviour itself is in the by-eye column.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<void> {
  const user = `ss${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
}

test('a swipeable row locks the browser to vertical panning', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('water the plants friday');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.waitForTimeout(300);

  // The swipe row is the element carrying the pan handlers. touch-action:
  // pan-y on it is what stops the vertical scroll while a horizontal swipe is
  // in flight. (Assert on the row itself, not a descendant: a Pressable inside
  // it carries touch-action: manipulation, which is a different answer to a
  // different question.)
  const row = page.getByTestId('rem-row').first();
  const touchAction = await row.evaluate((el) => getComputedStyle(el as HTMLElement).touchAction);
  expect(touchAction, 'the swipe row permits only vertical panning').toContain('pan-y');
});
