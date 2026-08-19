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

test('the toast stays on top of a sheet (Sean: "just make the toast always on top")', async ({ page }) => {
  // The old design accepted the opposite: a modal is a portal'd window above
  // the app, so a toast raised under one drew behind it. On the web the fix
  // is the maximum z-index on the toast's fill. The first draft of this test
  // asserted the portal carries NO z-index — and failed, which is how we
  // know it carries 9999: the investigation that said "none" was wrong, the
  // spec was not. The max beats 9999 in the root stacking context, PROVIDED
  // no ancestor of the fill establishes a stacking context of its own —
  // that would cap the fill at the ancestor's level, under the portal, with
  // the max z-index sitting right there in the styles looking correct.
  //
  // So the honest mechanism assertions are: fill at the max, portal below
  // it numerically, and NO capping ancestor. Raw paint stays unattestable:
  // elementFromPoint SKIPS pointer-events:none layers — which the fill
  // deliberately is, so clicks fall through — so a hit-test would "miss"
  // the toast with the fix working perfectly.
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  // Fire the toast, then open a real sheet inside its two-second life.
  await page.getByTestId('note-copymd').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save'), 'the sheet is open').toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('toast'), 'and the toast outlives its arrival').toBeVisible();
  const zs = await page.getByTestId('toast').evaluate((el) => {
    let fill: HTMLElement | null = el as HTMLElement;
    while (fill && getComputedStyle(fill).zIndex !== '2147483647') fill = fill.parentElement;
    const capping: string[] = [];
    for (let a = fill?.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const makesContext =
        (cs.position !== 'static' && cs.zIndex !== 'auto') ||
        cs.transform !== 'none' || cs.filter !== 'none' || Number(cs.opacity) < 1 ||
        cs.isolation === 'isolate' || cs.contain.includes('paint') || cs.contain.includes('strict');
      if (makesContext) capping.push(`${a.tagName}:${cs.zIndex}`);
    }
    const modal = [...document.body.children].find((c) => c !== document.querySelector('#root') && c.querySelector('[data-testid="recipe-save"]'));
    return {
      fillZ: fill ? getComputedStyle(fill).zIndex : null,
      capping,
      modalZ: modal ? getComputedStyle(modal.firstElementChild as HTMLElement).zIndex : 'no-portal',
    };
  });
  expect(zs.fillZ, 'the toast fill wears the max z-index').toBe('2147483647');
  expect(zs.capping, 'no ancestor caps the fill inside a lower stacking context').toEqual([]);
  const portalZ = zs.modalZ === 'auto' || zs.modalZ === 'no-portal' ? 0 : Number(zs.modalZ);
  expect(portalZ, "and the sheet's portal sits below it").toBeLessThan(2147483647);
});

// NO "the sean-only button is gone" TEST. It was written, and testids.spec.ts
// was right to reject it: `rem-copymd` is rendered by nothing now, so an
// absence assertion on it cannot fail — the exact trap CLAUDE.md lists. The
// button's removal is covered by the tests above actually using the menu
// instead, and by the guard itself, which would flag the testID if it came
// back unused.
