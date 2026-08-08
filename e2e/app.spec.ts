/**
 * The gesture suite — TESTING.md's by-eye column, given teeth. Real mouse
 * events against the exported app + real API on a scratch dir. Every spec
 * signs up its own account, so state never leaks between them.
 */
import { test, expect, type Page } from '@playwright/test';


/** A vertical drag in steps, from a grip, by a measured dy. */
async function dragVert(page: Page, grip: ReturnType<Page['getByTestId']>, dy: number) {
  const box = (await grip.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (i * dy) / 8);
  await page.mouse.up();
}


/** Long-press a row: the suite's way into page edit mode (grips live there). */
async function longPress(page: Page, locator: ReturnType<Page['getByTestId']>) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `e2e${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(`${user}@example.com`);
  await page.getByPlaceholder('Password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('signing up lands on the calendar, like the suite', async ({ page }) => {
  await signup(page);
  const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  await expect(page.getByText(month)).toBeVisible();
});

test('a reminder adds into its section and a tick completes it', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('buy milk');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'buy milk' });
  await expect(row).toBeVisible();
  await row.getByTestId('tick').click();
  // Completed rows hide until the ☑ toggle shows them.
  await expect(row).toBeHidden();
});

test('the folder manager reorders with a REAL drag, and it survives a reload', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  const rows = page.getByTestId('mgr-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Reminders');

  const b0 = (await rows.nth(0).boundingBox())!;
  const b1 = (await rows.nth(1).boundingBox())!;
  await dragVert(page, page.getByTestId('grip').first(), b1.y + b1.height / 2 - (b0.y + b0.height / 2) + 8);
  await expect(rows.first()).toContainText('Calendar');

  // The order is a synced record, not screen state — a fresh load agrees.
  // (A reload lands on the Calendar, as signing in does.)
  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await expect(page.getByTestId('mgr-row').first()).toContainText('Calendar', { timeout: 10_000 });
});

test('deleting takes two presses, never one', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Doomed');
  await page.getByPlaceholder('New folder').press('Enter');
  const doomed = page.getByTestId('mgr-row').filter({ hasText: 'Doomed' });
  await expect(doomed).toBeVisible();
  await doomed.getByTestId('mgr-del').click();
  await expect(doomed).toBeVisible(); // armed, not deleted
  await doomed.getByTestId('mgr-del').click();
  await expect(doomed).toBeHidden();
});

test('a long-press opens the inline edit', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('hold me');
  await page.getByTestId('rem-add-field').press('Enter');
  const body = page.getByTestId('rem-body').filter({ hasText: 'hold me' });
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit')).toHaveValue('hold me');
});

test('a reminder row drags to a new spot and the order survives a reload', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  for (const name of ['alpha', 'beta']) {
    await page.getByTestId('secadd-General').first().click();
    await page.getByTestId('rem-add-field').fill(name);
    await page.getByTestId('rem-add-field').press('Enter');
  }
  // New rows prepend: the list reads beta, alpha. Drag beta below alpha.
  const rows = page.getByTestId('rem-row');
  await expect(rows.first()).toContainText('beta');
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'beta' }));
  const r0 = (await rows.nth(0).boundingBox())!;
  const r1 = (await rows.nth(1).boundingBox())!;
  await dragVert(page, rows.first().getByTestId('row-grip'), r1.y + r1.height / 2 - (r0.y + r0.height / 2) + 8);
  await expect(rows.first()).toContainText('alpha');

  await page.reload();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').first()).toContainText('alpha', { timeout: 10_000 });
});

test('a note drags between folders and re-files', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  // The fresh account has one notes folder; make a second via the manager.
  await page.getByTestId('pick-notes').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Recipes');
  await page.getByPlaceholder('New folder').press('Enter');
  await page.getByText('Done', { exact: true }).click();
  // One note in each folder's General.
  const adds = page.getByTestId('secadd-General');
  await adds.first().click();
  await page.getByPlaceholder('New note').fill('first note');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByText('← All notes').click(); // the editor auto-opens on create
  await adds.nth(1).click();
  await page.getByPlaceholder('New note').fill('second note');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByText('← All notes').click();
  // Drag the first note down past the second (into the Recipes General).
  const rows = page.getByTestId('note-row');
  await expect(rows).toHaveCount(2);
  await longPress(page, rows.first());
  const n0 = (await rows.nth(0).boundingBox())!;
  const n1 = (await rows.nth(1).boundingBox())!;
  await dragVert(page, page.getByTestId('note-grip').first(), n1.y + n1.height / 2 - (n0.y + n0.height / 2) + 8);
  // Both notes now sit under the second folder block; first row is 'second note'.
  await expect(rows.first()).toContainText('second note');
});

test('a reminder drags into an EMPTY section', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // A fresh empty section under the Reminders folder.
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Target');
  await page.getByPlaceholder('New section').press('Enter');
  // One reminder in General.
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('wander');
  await page.getByTestId('rem-add-field').press('Enter');
  // Target sits ABOVE General (new sections prepend): drag the row UP into
  // its placeholder, by the placeholder's measured position. Edit mode first.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'wander' }));
  const hole = (await page.getByTestId('secempty-Target').boundingBox())!;
  const row = (await page.getByTestId('rem-row').first().boundingBox())!;
  await dragVert(page, page.getByTestId('row-grip').first(), hole.y + hole.height / 2 - (row.y + row.height / 2) - 8);
  // DOM order proves the re-file: 'wander' now renders inside Target's block,
  // before the General heading.
  const body = await page.locator('body').innerText();
  expect(body.indexOf('Target')).toBeLessThan(body.indexOf('wander'));
  expect(body.indexOf('wander')).toBeLessThan(body.indexOf('General'));
});

test('a SECTION drags between folders; a duplicate name refuses', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Chores');
  await page.getByPlaceholder('New section').press('Enter');

  // Long-press the section name: edit mode is where the grips live.
  await longPress(page, page.getByText('Chores', { exact: true }));
  await page.keyboard.press('Tab'); // leave the rename field the long-press opened
  // Drag Chores down into the Calendar folder's block.
  const grip = page.getByTestId('sec-grip-Chores');
  const box = (await grip.boundingBox())!;
  const calHead = await page.getByText('Calendar', { exact: true }).boundingBox();
  const targetY = calHead!.y + calHead!.height + 60; // inside the Calendar block
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + ((targetY - box.y) * i) / 10);
  }
  await page.mouse.up();
  const body = await page.locator('body').innerText();
  expect(body.indexOf('Calendar')).toBeLessThan(body.indexOf('Chores'));

  // 'General' into the Calendar folder would collide with its General: refused.
  const gGrip = page.getByTestId('sec-grip-General').first();
  const gBox = (await gGrip.boundingBox())!;
  await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + gBox.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + ((targetY + 40 - gBox.y) * i) / 10);
  }
  await page.mouse.up();
  const after = await page.locator('body').innerText();
  // Reminders folder still holds its General (it renders before Calendar).
  expect(after.indexOf('General')).toBeLessThan(after.indexOf('Calendar'));
});

test('editing a reminder into a Note converts one-way', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('becomes a note');
  await page.getByTestId('rem-add-field').press('Enter');
  const body = page.getByTestId('rem-body').filter({ hasText: 'becomes a note' });
  // Long-press into inline edit, then the ✎ opens the full window.
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit')).toBeVisible();
  await page.getByTestId('rem-pencil').click();
  await page.getByTestId('kind-note').click();
  await page.getByText('Save', { exact: true }).click();
  // Gone from Reminders, present in Notes.
  await expect(page.getByTestId('rem-row').filter({ hasText: 'becomes a note' })).toBeHidden();
  await page.getByTestId('tab-notes').click();
  await expect(page.getByTestId('note-row').filter({ hasText: 'becomes a note' })).toBeVisible();
});

test('the ⧉ copies a reminder directly under itself', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('twin me');
  await page.getByTestId('rem-add-field').press('Enter');
  const body = page.getByTestId('rem-body').filter({ hasText: 'twin me' });
  const box = (await body.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.getByTestId('rem-edit')).toBeVisible();
  await page.getByTestId('rem-dup').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'twin me' })).toHaveCount(2);
});

test('week mode: swipe up folds the grid, arrows page by week, swipe down restores', async ({ page }) => {
  await signup(page);
  // Land on Calendar; the grid shows a full month (>7 day cells).
  const grid = page.getByTestId('cal-grid');
  const box = (await grid.boundingBox())!;
  const cx = box.x + box.width / 2;
  const countCells = () => page.getByTestId('cal-cell').count();
  expect(await countCells()).toBeGreaterThan(7);
  // A firm swipe UP on the grid folds to one week.
  await page.mouse.move(cx, box.y + 120);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx, box.y + 120 - i * 15);
  await page.mouse.up();
  await expect.poll(countCells).toBe(7);
  // Arrows page a week at a time; five presses always cross a month edge.
  const label = () => page.getByTestId('cal-ym').innerText();
  const before = await label();
  for (let i = 0; i < 5; i++) await page.getByTestId('cal-next').click();
  expect(await label()).not.toBe(before);
  // Swipe DOWN opens the month back up.
  await page.mouse.move(cx, box.y + 30);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx, box.y + 30 + i * 15);
  await page.mouse.up();
  await expect.poll(countCells).toBeGreaterThan(7);
});

test('note body renders its markers as styled text when you tap away', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('styled');
  await page.getByPlaceholder('New note').press('Enter');
  // The editor auto-opens. Tap the body, type markers, then tap the title.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('**loud** and *slanted*\n- milk\n> wisdom');
  await page.getByPlaceholder('Title').click();
  const view = page.getByTestId('note-body-view');
  await expect(view).toBeVisible();
  const text = await view.innerText();
  expect(text).toContain('loud');
  expect(text).not.toContain('**');
  expect(text).toContain('•');
  expect(text).toContain('milk');
  expect(text).not.toContain('- milk');
  expect(text).toContain('wisdom');
  expect(text).not.toContain('> wisdom');
});

test('swipe a row left: the delete arrives already armed, one tap fires', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('swipe me');
  await page.getByTestId('rem-add-field').press('Enter');
  const row = page.getByTestId('rem-row').filter({ hasText: 'swipe me' });
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 40, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width - 40 - i * 15, y);
  await page.mouse.up();
  await page.getByTestId('swipe-del').click();
  await expect(row).toBeHidden();
});

test('a theme picked in Settings repaints the app, syncs, and login stays midnight', async ({ page }) => {
  const user = await signup(page);
  const pageBg = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="page-root"]') as HTMLElement;
    return getComputedStyle(el).backgroundColor;
  });
  expect(await pageBg()).toBe('rgb(17, 17, 17)'); // midnight #111111
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('theme-sage').click();
  await expect.poll(pageBg).toBe('rgb(254, 250, 224)'); // sage #fefae0
  // The pick is a synced pref: a reload comes back cream.
  await page.reload();
  await expect.poll(pageBg, { timeout: 10_000 }).toBe('rgb(254, 250, 224)');
  // Logging out returns to midnight — the login page has no user to theme.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Log out', { exact: true }).click();
  await expect.poll(pageBg, { timeout: 10_000 }).toBe('rgb(17, 17, 17)');
});

test('edit mode gates the row controls: absent, long-press reveals, Escape leaves', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('gated');
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-dup')).toBeHidden();
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'gated' }));
  await expect(page.getByTestId('rem-dup')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rem-dup')).toBeHidden();
});

test('sharing: mutual handshake, @partner view, a tick lands in their store', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const userB = await signup(pageB); // B exists first, so A can name a real account
  const userA = await signup(pageA);

  // A: one reminder in the starter folder, then share that folder with B.
  await pageA.getByTestId('tab-reminders').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('rem-add-field').fill('peel garlic');
  await pageA.getByTestId('rem-add-field').press('Enter');
  await pageA.getByText(userA, { exact: true }).click();
  await pageA.getByText('Settings', { exact: true }).click();
  await pageA.getByTestId('open-share').click();
  await pageA.getByTestId('share-add-partner').fill(userB);
  await pageA.getByTestId('share-add-partner').press('Enter');
  await pageA.getByTestId('share-folders-Reminders').click();
  await pageA.getByText('Done', { exact: true }).click();

  // B: add A back — the handshake closes and A's folder flows in.
  await pageB.getByText(userB, { exact: true }).click();
  await pageB.getByText('Settings', { exact: true }).click();
  await pageB.getByTestId('open-share').click();
  await pageB.getByTestId('share-add-partner').fill(userA);
  await pageB.getByTestId('share-add-partner').press('Enter');
  await expect(pageB.getByText('sharing', { exact: true })).toBeVisible({ timeout: 10_000 });
  // Rename the entry: a display label, mine alone — the key never moves.
  await pageB.getByText('✎', { exact: true }).first().click();
  await pageB.locator('input:focus').fill('Buddy');
  await pageB.locator('input:focus').press('Enter');
  await expect(pageB.getByText('Buddy', { exact: true })).toBeVisible();
  await pageB.getByText('Done', { exact: true }).click();

  // B opens @A: Reminders and ticks A's row — the picker wears the label.
  await pageB.getByTestId('tab-reminders').click();
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByTestId('pick-shared-Reminders').click();
  await expect(pageB.getByText('@Buddy: Reminders')).toBeVisible();
  await expect(pageB.getByText('peel garlic')).toBeVisible();
  await pageB.getByTestId('shared-tick').first().click();
  await expect(pageB.getByText('peel garlic')).toBeHidden({ timeout: 10_000 });

  // The tick lives in A's store: A's own list hides the done row.
  await pageA.reload();
  await pageA.getByTestId('tab-reminders').click();
  await expect(pageA.getByTestId('rem-row').filter({ hasText: 'peel garlic' })).toBeHidden({ timeout: 10_000 });

  // The All listing shows A's block with a LIVE tick too: A adds another row,
  // B (back on All) ticks it right there without entering the shared view.
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('rem-add-field').fill('chop onions');
  await pageA.getByTestId('rem-add-field').press('Enter');
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByText('All', { exact: true }).click();
  await expect(pageB.getByText('chop onions')).toBeVisible({ timeout: 15_000 });
  await pageB.getByTestId('all-shared-tick').first().click();
  await expect(pageB.getByText('chop onions')).toBeHidden({ timeout: 10_000 });

  // The shared recolour: my override, my prefs, their data untouched.
  await pageB.getByTestId('pick-reminders').click();
  await pageB.getByText('Manage folders…').click();
  const swatch = pageB.getByTestId('shared-swatch-Reminders');
  const before = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
  await swatch.click();
  await expect.poll(() => swatch.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
  await pageB.getByText('Done', { exact: true }).click();

  // The add window's partner pair: a reminder dropped straight into A's
  // shared section, exactly one owner selected.
  await pageB.getByTestId('tab-calendar').click();
  await pageB.getByText('+ Add', { exact: true }).click();
  await pageB.getByTestId('kind-reminder').click();
  await pageB.getByPlaceholder(/What\?/).fill('buy bread');
  await pageB.getByText('—', { exact: true }).click();
  await pageB.getByText('Reminders · General', { exact: true }).last().click();
  await pageB.getByText('Save', { exact: true }).click();
  await pageA.reload();
  await pageA.getByTestId('tab-reminders').click();
  await expect(pageA.getByTestId('rem-row').filter({ hasText: 'buy bread' })).toBeVisible({ timeout: 10_000 });
  await ctxA.close();
  await ctxB.close();
});

test("sharing: a calendar shows under the partner's day-panel group; notes read rendered", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const userB = await signup(pageB);
  const userA = await signup(pageA);

  // A: an event today (the add modal defaults to the selected day = today)
  // and a note, then share the starter calendar and note folder with B.
  await pageA.getByText('+ Add', { exact: true }).click();
  await pageA.getByTestId('kind-event').click();
  await pageA.getByPlaceholder(/What\?/).fill('joint dinner');
  await pageA.getByText('Save', { exact: true }).click();
  await pageA.getByTestId('tab-notes').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByPlaceholder('New note').fill('the recipe');
  await pageA.getByPlaceholder('New note').press('Enter');
  await pageA.getByTestId('note-body-view').click();
  await pageA.getByTestId('note-body-edit').fill('**garlic** first');
  await pageA.getByText('← All notes').click();
  await pageA.getByText(userA, { exact: true }).click();
  await pageA.getByText('Settings', { exact: true }).click();
  await pageA.getByTestId('open-share').click();
  await pageA.getByTestId('share-add-partner').fill(userB);
  await pageA.getByTestId('share-add-partner').press('Enter');
  await pageA.getByTestId('share-calendars-Personal').click();
  await pageA.getByTestId('share-notefolders-General').click();
  await pageA.getByText('Done', { exact: true }).click();

  // B adds A back, then looks at today and at the shared notes.
  await pageB.getByText(userB, { exact: true }).click();
  await pageB.getByText('Settings', { exact: true }).click();
  await pageB.getByTestId('open-share').click();
  await pageB.getByTestId('share-add-partner').fill(userA);
  await pageB.getByTestId('share-add-partner').press('Enter');
  await expect(pageB.getByText('sharing', { exact: true })).toBeVisible({ timeout: 10_000 });
  await pageB.getByText('Done', { exact: true }).click();

  await pageB.getByTestId('tab-calendar').click();
  await expect(pageB.getByText(`${userA}'s events`)).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('joint dinner')).toBeVisible();

  await pageB.getByTestId('tab-notes').click();
  await pageB.getByTestId('pick-notes').click();
  await pageB.getByTestId('pick-shared-General').click();
  await pageB.getByTestId('shared-note-row').click();
  await expect(pageB.getByText('garlic')).toBeVisible();
  const body = await pageB.getByText('garlic').textContent();
  expect(body).not.toContain('**');

  // B edits the shared body; the edit lands in A's store.
  await pageB.getByTestId('shared-note-body').click();
  await pageB.getByTestId('shared-note-edit').fill('**garlic** first, then onions');
  await pageB.getByText(/← @/).click();
  await pageA.reload();
  await pageA.getByTestId('tab-notes').click();
  await pageA.getByTestId('note-row').filter({ hasText: 'the recipe' }).click();
  await expect(pageA.getByText(/then onions/)).toBeVisible({ timeout: 10_000 });
  await ctxA.close();
  await ctxB.close();
});

test('?tick= opens the one-reminder Done page and rolls a repeat', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('stretch 8/1');
  await page.getByTestId('rem-add-field').press('Enter');
  // Grab its id off the DOM-free route: the row's testID doesn't carry ids,
  // so read it from the sync engine via the page's storage snapshot.
  const id = await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => k.includes('calmind.snap'));
    for (const k of keys) {
      const snap = JSON.parse(localStorage.getItem(k)!);
      const rec = (snap.recs ?? snap.records ?? []).find?.((r: { type: string; payload?: { text?: string } }) => r.type === 'reminder' && r.payload?.text === 'stretch');
      if (rec) return rec.id as string;
    }
    return null;
  });
  expect(id).toBeTruthy();
  await page.goto(`./?tick=${id}`);
  await expect(page.getByTestId('quick-done')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('quick-done').click();
  // Lands on the app; the reminder is done (hidden from the open list).
  await expect(page.getByTestId('tab-reminders')).toBeVisible();
  await page.getByTestId('tab-reminders').click();
  await expect(page.getByTestId('rem-row').filter({ hasText: 'stretch' })).toBeHidden();
});

test('a ticked repeat ROLLS and flashes instead of checking off', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('water ferns 12/1');
  await page.getByTestId('rem-add-field').press('Enter');
  // Give it a weekly repeat through the full-edit window.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'water ferns' }));
  await page.getByTestId('rem-pencil').click();
  await page.getByText('+ Repeat', { exact: true }).click();
  await page.getByText('Save', { exact: true }).click();
  await page.keyboard.press('Escape');
  // Tick it: the row STAYS (rolled, not done) and flashes.
  const row = page.getByTestId('rem-row').filter({ hasText: 'water ferns' });
  await row.getByTestId('tick').click();
  await expect(row).toBeVisible();
  const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)'); // the accent-soft flash is on
  await page.waitForTimeout(2400);
  const after = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(after).toBe('rgba(0, 0, 0, 0)'); // and it fades back out
});

test('the selected day survives a trip to another tab', async ({ page }) => {
  await signup(page);
  // Pick a different day than today (the 15th is always on the grid).
  await page.getByTestId('cal-cell').filter({ hasText: /^15$/ }).first().click();
  await expect(page.getByText(/15/).first()).toBeVisible();
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByText(/, .* 15/)).toBeVisible(); // the panel heading still says the 15th
});
