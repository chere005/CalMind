/**
 * Copy as Markdown, on every tab and for every user.
 *
 * Sean, 2026-08-12. It used to be one ⧉ button on the Reminders toolbar,
 * rendered only when the username was 'sean' — so it was his alone, on one
 * screen, in a toolbar row that existed for it. It lives in the account
 * dropdown now, which every tab already has, and the row it left behind is
 * gone entirely.
 *
 * Notes is the exception and has its own Copy control, because the note
 * editor is its own screen with no dropdown to hang it off.
 *
 * The clipboard itself is not read here. A headless browser's clipboard is a
 * permissions maze, and what would be proved is Playwright's grant rather
 * than the app's behaviour — so this checks the app's own answer, which is
 * the thing a person sees: the "Copied as Markdown" popup. The SHAPE of
 * the markdown is core's business and is tested there.
 *
 * ONE MARKER, `toast`, for both answers now. They were two inline `<Text>`
 * nodes — `undo-note` under the top bar and `note-copynote` beside the
 * editor's Copy — and Sean named the problem with being laid-out children:
 * "text that randomly inserts itself". They are one centred popup, so they
 * are one testID. The claim each test makes is unchanged.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `cm${Date.now()}${seq++}`;
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

test('the account menu offers it on every tab, for an ordinary user', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);

  // NOT 'sean' — this account is whatever signup made it, and that is the
  // point: the old button was behind a username check.
  for (const tab of ['tab-reminders', 'tab-calendar', 'tab-habits']) {
    await page.getByTestId(tab).click();
    await page.getByTestId('topbar-sync').click();
    await expect(page.getByTestId('menu-copymd'), `${tab} offers Copy as Markdown`).toBeVisible();
    // Close it the way a person does — the backdrop. Escape does not close
    // this menu, and leaving it open blocks the next tab behind the modal.
    await page.mouse.click(8, 400);
    await page.waitForTimeout(250);
  }
});

test('it says so when it has copied', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('feed the cat');
  await page.getByTestId('rem-add-field').press('Enter');

  await page.getByTestId('topbar-sync').click();
  await page.getByTestId('menu-copymd').click();
  // Either answer is acceptable — a headless browser may refuse the
  // clipboard — but SOME answer is the whole point. The old button said
  // nothing whether it worked or not, and a button with no answer is a
  // button you press twice.
  await expect(page.getByTestId('toast'), 'it tells you what happened')
    .toHaveText(/Copied as Markdown|Could not copy/, { timeout: 10_000 });
});

test('the note editor has its own Copy, since it has no dropdown', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');

  await expect(page.getByTestId('topbar-sync'), 'the editor has no account menu').toHaveCount(0);
  await page.getByTestId('note-copymd').click();
  await expect(page.getByTestId('toast'), 'and it pops up its little note')
    .toHaveText(/Copied as Markdown|Could not copy/, { timeout: 10_000 });
});

// NO "the sean-only button is gone" TEST. It was written, and testids.spec.ts
// was right to reject it: `rem-copymd` is rendered by nothing now, so an
// absence assertion on it cannot fail — the exact trap CLAUDE.md lists. The
// button's removal is covered by the tests above actually using the menu
// instead, and by the guard itself, which would flag the testID if it came
// back unused.
