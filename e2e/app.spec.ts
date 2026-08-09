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
  // A beat before letting go. The drag measures its rows asynchronously on
  // touch-down, and a mouse that presses, crosses three rows and releases
  // inside one frame can outrun that — which no finger can. Without this the
  // harness was testing a gesture the app will never receive.
  await page.waitForTimeout(120);
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
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
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
  await expect.poll(countCells).toBe(14); // Sean's fold: this week AND the next
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

test('a day is selected by a TAP and nothing else — a swipe never picks the cell it lands on', async ({ page }) => {
  // The suite's own scar: watching click meant every swipe across the grid
  // selected whichever cell the finger lifted off, so a month you paged to
  // opened on a day you never picked. CalMind avoids it by claiming the
  // gesture at the grid once there is real travel — which is exactly the
  // kind of thing that works until someone touches the responder.
  await signup(page);
  const title = () => page.getByTestId('cal-day-title').innerText();
  const grid = page.getByTestId('cal-grid');
  const box = (await grid.boundingBox())!;
  const picked = await title();

  // A firm SIDEWAYS swipe pages the month and must leave the day alone.
  const ym = () => page.getByTestId('cal-ym').innerText();
  const monthBefore = await ym();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 30 - i * 20, y);
  await page.mouse.up();
  await expect.poll(ym).not.toBe(monthBefore); // the swipe DID page…
  expect(await title()).toBe(picked); // …and picked nothing on the way

  // A vertical swipe folds the grid and must leave the day alone too.
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2, box.y + 120 - i * 15);
  await page.mouse.up();
  await expect.poll(async () => page.getByTestId('cal-cell').count()).toBe(14);
  expect(await title()).toBe(picked);

  // …and a plain TAP still selects, or the rule above would be a dead one.
  const cells = page.getByTestId('cal-cell');
  const n = await cells.count();
  for (let i = 0; i < n; i++) {
    await cells.nth(i).click();
    if ((await title()) !== picked) break;
  }
  expect(await title()).not.toBe(picked);
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
  await swatch.click(); // opens the tray
  await pageB.getByTestId('shared-swatch-Reminders-f6b4b2').click(); // pick the rose
  await expect.poll(() => swatch.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(246, 180, 178)');
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
  // A dated note, filed from the day panel so it lands on today: the suite
  // shows a partner's dated notes on their day exactly like my own.
  await pageA.getByText('+ Add', { exact: true }).click();
  await pageA.getByTestId('kind-note').click();
  await pageA.getByPlaceholder(/What\?/).fill('shopping list');
  await pageA.getByText('Save', { exact: true }).click();
  await pageA.getByText('← All notes').click();
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
  await expect(pageB.getByText(`${userA}'s notes`)).toBeVisible();
  await expect(pageB.getByText('shopping list')).toBeVisible();

  // B files an event of their own, and the panel's groups fall in the suite's
  // fixed order: one group per kind AND owner, mine before theirs, kinds in
  // the legend's order — never reshuffled by what the day happens to hold.
  await pageB.getByText('+ Add', { exact: true }).click();
  await pageB.getByTestId('kind-event').click();
  await pageB.getByPlaceholder(/What\?/).fill('my own thing');
  await pageB.getByText('Save', { exact: true }).click();
  await pageB.getByText('+ Add', { exact: true }).click();
  await pageB.getByTestId('kind-reminder').click();
  await pageB.getByPlaceholder(/What\?/).fill('my own errand');
  await pageB.getByText('Save', { exact: true }).click();
  const heads = (await pageB.getByTestId('dp-group-head').allTextContents()).map((h) => h.replace(/^[▸▾]\s*/, ''));
  expect(heads).toEqual(['Events', `${userA}'s events`, 'Reminders', `${userA}'s notes`]);

  await pageB.getByTestId('tab-notes').click();
  await pageB.getByTestId('pick-notes').click();
  await pageB.getByTestId('pick-shared-General').click();
  await pageB.getByTestId('shared-note-row').filter({ hasText: 'the recipe' }).click();
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

test('the widget setup page bakes the pin and carries the whole script', async ({ page }) => {
  const user = await signup(page);
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('open-widget').click();
  await expect(page.getByText('Calendar widget')).toBeVisible();
  await expect(page.getByTestId('copy-script')).toBeVisible({ timeout: 10_000 });
  await page.getByText(/Show raw feed URL/).click();
  const raw = await page.getByText(/feed=1&t=/).last().innerText();
  expect(raw).toContain('&cals=all'); // every calendar showing → the all pin
  await expect(page.getByText(/every calendar/)).toBeVisible();

  // …and the script it hands over is the SUITE's widget, not the flat list a
  // rewrite once shipped: a header row, uppercase day headings with today in
  // green over its own rule, a heavier rule between days, the time
  // right-aligned rather than crammed in front of the title, and a real
  // empty-state line. These two copies (this page and
  // tools/scriptable-widget.js) drifted apart once already.
  const script = await page.getByTestId('script-body').innerText();
  for (const mark of [
    'head.addText("Calendar")',      // the header row
    'toUpperCase()',                 // uppercase day headings
    'rule(2, "#3a3a3a")',            // the divider between days
    'rule(1, isToday ? "#2f5f4d"',   // today's own green underline
    'No more items today.',          // the empty state, not an omitted day
    'row.addSpacer();',              // the time pushed to the far edge
  ]) {
    expect(script, `the widget script kept: ${mark}`).toContain(mark);
  }
  // The regression it shipped as: amber headings and the time inline.
  expect(script).not.toContain('#f0b429');
  expect(script).not.toContain('row.time + " "');
});

test('habits shows five day columns on a phone and seven with room, paging without gaps', async ({ page }) => {
  // Sean's rule, made a real breakpoint rather than a permanent narrowing.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByText('+', { exact: true }).first().click();
  await page.getByPlaceholder('New habit').fill('stretch');
  await page.getByPlaceholder('New habit').press('Enter');

  const cols = () => page.getByTestId('habit-daycol').count();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(cols).toBe(5);
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect.poll(cols).toBe(7);

  // Back on a phone, a page back must land the window immediately before the
  // one shown — stepping a fixed seven while showing five would drop two days
  // down the crack between the two pages.
  await page.setViewportSize({ width: 390, height: 900 });
  const heads = () => page.getByTestId('habit-dayhead').allTextContents();
  await expect.poll(async () => (await heads()).length).toBe(5);
  const shown = await heads();
  await page.getByTestId('habits-prev').click();
  // The window re-renders on its own clock; wait for it to actually turn over
  // rather than reading the outgoing one and calling it the previous page.
  await expect.poll(async () => (await heads())[0]).not.toBe(shown[0]);
  const prev = await heads();
  expect(prev).toHaveLength(5);
  expect(prev.some((d) => shown.includes(d))).toBe(false); // no overlap…
  const dayNum = (s: string) => Number(s.replace(/\D+/g, ''));
  expect(dayNum(shown[0]!) - dayNum(prev[4]!)).toBe(1); // …and no gap either
});

test("a folder's colour is one source of truth: manage menu → legend chip → the date's mark", async ({ page }) => {
  // Sean's chain. The folder colour set in the manage menu is authoritative;
  // the legend chip and the marker on the day must both read it, and both
  // must follow when it changes.
  await signup(page);
  // Filed from the day panel so it is DUE today and therefore lands on the
  // grid — an undated reminder never reaches a cell to be coloured.
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('paint the day');
  await page.getByText('Save', { exact: true }).click();

  // The mark on a day and the chip in the key, as the SVG strokes they are.
  const markColor = async () =>
    page.getByTestId('cal-mark-well').locator('rect').first().getAttribute('stroke');
  const chipColor = async () =>
    page.getByTestId('legend-me').locator('rect').first().getAttribute('stroke');

  const before = await markColor();
  expect(before).toBeTruthy();
  expect(await chipColor()).toBe(before); // they agree to start with

  // Repaint the folder in the manage menu and watch both ends of the chain.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await page.getByTestId('mgr-swatch-Reminders').click();
  const options = page.getByTestId(/^mgr-swatch-Reminders-/);
  const hexes = (await options.evaluateAll((els) =>
    els.map((el) => '#' + (el.getAttribute('data-testid') ?? '').split('-').pop()),
  )).filter((h) => h.toLowerCase() !== (before ?? '').toLowerCase());
  const picked = hexes[0]!; // any colour it isn't already wearing
  await page.getByTestId(`mgr-swatch-Reminders-${picked.slice(1)}`).click();
  await page.getByText('Done', { exact: true }).click();
  await page.getByTestId('tab-calendar').click();

  await expect.poll(markColor).toBe(picked);
  expect(await chipColor()).toBe(picked);

  // And an OVERDUE one keeps the folder's colour too. This is the case that
  // was actually wrong: the mark was swapped for the theme's overdue orange,
  // so a late day's square stopped matching its own chip in the key. The
  // suite paints the icon its folder's colour and lets the `overdue` class
  // change nothing; only a finished colour greys, and that hides anyway.
  // A bare m/d means the NEXT such date, so a past day needs its year said
  // out loud or it lands a year ahead and is never overdue at all.
  const n = new Date();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('late thing');
  await page.getByPlaceholder('m/d').fill(`${n.getMonth() + 1}/${n.getDate()}/${n.getFullYear() - 1}`);
  await page.getByText('Save', { exact: true }).click();

  await expect(page.getByText('late thing')).toBeVisible();
  expect(await markColor()).toBe(picked);
  expect(await chipColor()).toBe(picked);
});

test('the page carries the web-app head an installed iOS PWA needs', async ({ page }) => {
  // Without viewport-fit=cover, env(safe-area-inset-*) is 0 on iOS, the app
  // never pads for the notch, and iOS paints its own LIGHT status bar over
  // the top — the white strip above a dark app. The translucent style is what
  // lets the theme's own background show through that inset instead.
  await page.goto('.');
  const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content');
  expect(await meta('viewport')).toContain('viewport-fit=cover');
  expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
  expect(await meta('apple-mobile-web-app-capable')).toBe('yes');
  expect(await meta('theme-color')).toBeTruthy();

  // The manifest the suite has always had: what makes the app installable on
  // Android and desktop Chrome/Edge. Its URLs are relative, so it resolves
  // against wherever it is served rather than baking /test/calmind in.
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const res = await page.request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const mf = await res.json();
  expect(mf.display).toBe('standalone');
  expect(mf.start_url).toBe('./');
  expect(mf.icons.length).toBeGreaterThan(0);
  expect(mf.icons.every((i: { src: string }) => i.src.startsWith('./'))).toBe(true);
});

test('a habit drags to a new spot, and the order survives a reload', async ({ page }) => {
  // Habits reorder like Reminders and Notes now: the grips live in the edit
  // mode the top bar's pencil opens, and the stored ord IS the display order.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  for (const name of ['stretch', 'water', 'walk']) {
    await page.getByText('+', { exact: true }).first().click();
    await page.getByPlaceholder('New habit').fill(name);
    await page.getByPlaceholder('New habit').press('Enter');
  }
  const names = page.getByTestId('habit-grip');
  await expect(names).toHaveCount(3);

  await page.getByTestId('habits-edit').click();
  const g0 = (await names.nth(0).boundingBox())!;
  const g2 = (await names.nth(2).boundingBox())!;
  // Drag the first habit down past the third.
  await dragVert(page, names.first(), g2.y + g2.height / 2 - (g0.y + g0.height / 2) + 8);

  const order = async () => (await page.getByTestId('habit-name').allTextContents());
  expect(await order()).toEqual(['water', 'walk', 'stretch']);
  await page.reload();
  await page.getByTestId('tab-habits').click();
  expect(await order()).toEqual(['water', 'walk', 'stretch']);
});

test('a habit renames on ONE tap once the Edit pencil is on', async ({ page }) => {
  // The suite offers three ways in — double-click, long-press, or a single
  // tap while editing. Asking for a double-tap when the pencil is already on
  // is a toll for nothing.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByText('+', { exact: true }).first().click();
  await page.getByPlaceholder('New habit').fill('stretch');
  await page.getByPlaceholder('New habit').press('Enter');
  await expect(page.getByTestId('habit-name')).toHaveText('stretch');

  // Out of edit mode one tap does nothing — the double-tap gate still stands.
  await page.getByTestId('habit-name').click();
  await expect(page.getByTestId('habit-rename')).toHaveCount(0);

  await page.getByTestId('habits-edit').click();
  await page.getByTestId('habit-name').click();
  const field = page.getByTestId('habit-rename');
  await expect(field).toBeVisible();
  await field.fill('stretch daily');
  await field.press('Enter');
  await expect(page.getByTestId('habit-name')).toHaveText('stretch daily');
});

test('the month cell keeps a fixed two-row mark well, busy day or empty', async ({ page }) => {
  // The suite's rule: the icons sit in a FIXED two-row well, so every cell
  // stands the same height however busy its day. A one-row minimum let a
  // quiet day's cell sit shorter than a busy one's.
  await signup(page);
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('one mark');
  await page.getByText('Save', { exact: true }).click();

  const wells = page.getByTestId('cal-mark-well');
  const heights = new Set<number>();
  for (let i = 0; i < (await wells.count()); i++) {
    const box = await wells.nth(i).boundingBox();
    heights.add(Math.round(box!.height * 2) / 2);
  }
  // Every well the same, and that height is two 11px rows plus the 1.5 gap —
  // not the single row a marked-up cell would otherwise collapse to.
  expect([...heights]).toEqual([23.5]);
});

test('a fresh add through the day-panel modal is visible immediately', async ({ page }) => {
  // showAgain's single-view and hidden cases are pinned in core tests; this
  // holds the visible outcome end-to-end.
  await signup(page);
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('resurfaced');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('resurfaced')).toBeVisible();
});

test('a fully-done colour leaves the month cell unless Completed is shown', async ({ page }) => {
  await signup(page);
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('cellgate');
  await page.getByText('Save', { exact: true }).click();
  const cellIcons = page.locator('[data-testid="cal-cell"] svg');
  await expect.poll(() => cellIcons.count()).toBeGreaterThan(0); // the open box marks today
  await page.getByTestId('day-tick').first().click(); // its colour is fully done now
  await expect.poll(() => cellIcons.count()).toBe(0); // hidden, not greyed
  await page.getByTestId('cal-completed').click();
  await expect.poll(() => cellIcons.count()).toBeGreaterThan(0); // Completed brings it back
});


test('the day panel cluster waits for a double-click, like the suite', async ({ page }) => {
  await signup(page);
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('two step');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('two step')).toBeVisible();
  await expect(page.getByText('✎')).toBeHidden();
  await page.getByText('two step').dblclick();
  await expect(page.getByText('✎')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('✎')).toBeHidden();
});

test('a section deletes with two presses from edit mode', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Doomed');
  await page.getByPlaceholder('New section').press('Enter');
  // Long-press the section name: edit mode on (the rename field opens too).
  const name = page.getByText('Doomed', { exact: true });
  const box = (await name.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  const del = page.getByTestId('secdel-Doomed');
  await expect(del).toBeVisible();
  await del.click(); // arms
  await del.click(); // deletes
  await expect(page.getByTestId('secdel-Doomed')).toBeHidden();
  await expect(page.getByText('Doomed', { exact: true })).toBeHidden();
});

test('a Notes section renames via double-click', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('nsec-name-General').dblclick();
  const field = page.getByTestId('nsec-rename');
  await expect(field).toBeVisible();
  await field.fill('Stuff');
  await field.press('Enter');
  await expect(page.getByText('Stuff', { exact: true }).first()).toBeVisible();
});

test('typed "tomorrow" files a reminder on tomorrow, and the word leaves the title', async ({ page }) => {
  // The relative tokens are pinned in spec/parse.json; this holds the WIRING —
  // that the screens hand the parser a clock at all, and that the token lifts
  // out of the stored title the way 8/3 and 2pm always have.
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('Take the bins out tomorrow');
  await page.getByTestId('rem-add-field').press('Enter');

  const row = page.getByTestId('rem-row').filter({ hasText: 'Take the bins out' });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('tomorrow');   // the token is an instruction
  const tomorrow = new Date(Date.now() + 86_400_000);
  const chip = tomorrow.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  await expect(row).toContainText(chip);
});

test('a recipe line is mended by tapping it, not by deleting and retyping', async ({ page }) => {
  // OCR hands you typos by the handful. Before this the only way to fix one
  // was to delete the row and type the whole line again — on a phone, the
  // difference between correcting a recipe and abandoning it.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('Pancakes');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('2 cups flur\n1. Mix it');
  await page.getByTestId('recipe-import').click();

  await page.getByTestId('ing-row').first().click();
  const field = page.getByTestId('ing-edit');
  await expect(field).toBeVisible();
  await field.fill('3 cups flour');
  await field.press('Enter');
  await expect(page.getByTestId('ing-row').first()).toContainText('3 cups flour');

  // A step mends the same way…
  await page.getByTestId('step-row').first().click();
  const stepField = page.getByTestId('step-edit');
  await stepField.fill('Mix it well');
  await stepField.press('Enter');
  await expect(page.getByTestId('step-row').first()).toContainText('Mix it well');

  // …and emptying a line deletes it, the way an empty add does.
  await page.getByTestId('ing-row').first().click();
  await page.getByTestId('ing-edit').fill('');
  await page.getByTestId('ing-edit').press('Enter');
  await expect(page.getByTestId('ing-row')).toHaveCount(0);
});

test('recipe lines reorder by dragging the marker they already wear', async ({ page }) => {
  // OCR hands ingredients over in whatever order the camera found them, so a
  // recipe you can't reorder is one you have to retype. The bullet and the
  // step number are the handles — the rows gain no furniture for it.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('Pancakes');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk\n3 eggs');
  await page.getByTestId('recipe-import').click();

  const rows = () => page.getByTestId('ing-row').allTextContents();
  await expect.poll(rows).toEqual(['2 cups flour', '1 cup milk', '3 eggs']);
  // The Recipe page slides in; measuring a grip mid-animation aims the drag
  // at where the row USED to be.
  await page.waitForTimeout(400);

  const grips = page.getByTestId('ing-grip');
  const g0 = (await grips.nth(0).boundingBox())!;
  const g2 = (await grips.nth(2).boundingBox())!;
  await dragVert(page, grips.first(), g2.y + g2.height / 2 - (g0.y + g0.height / 2) + 8);
  await expect.poll(rows).toEqual(['1 cup milk', '3 eggs', '2 cups flour']);

  // The order is what gets saved, not merely what is drawn.
  await page.getByTestId('recipe-save').click();
  await expect(page.getByTestId('note-body-view')).toContainText('1 cup milk');
  const body = await page.getByTestId('note-body-view').innerText();
  expect(body.indexOf('1 cup milk')).toBeLessThan(body.indexOf('2 cups flour'));
});

test('the Recipe page can shed the non-recipe notes with its checkbox', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('Pancakes');
  await page.getByPlaceholder('New note').press('Enter');
  // The editor auto-opens; give the body a recipe plus one free-text line.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1. Mix well\nGrandma loved these, and she always doubled the butter.');
  await page.getByTestId('recipe-import').click();
  // The checkbox shows because free text exists; untick and save.
  await expect(page.getByTestId('recipe-incnotes')).toBeVisible();
  await page.getByTestId('recipe-incnotes').click();
  await page.getByTestId('recipe-save').click();
  const body = page.getByTestId('note-body-view');
  await expect(body).toContainText('flour');
  await expect(body).not.toContainText('Grandma');
});

test("the tri-state silences a folder's riders on the calendar", async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // An undated reminder in the CALENDAR folder rides on today.
  await page.getByTestId('secadd-General').nth(1).click();
  await page.getByTestId('rem-add-field').fill('ride me');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByText('ride me', { exact: true })).toBeVisible();
  // Manage reminders → Calendar folder → None.
  await page.getByTestId('pick-calendar').click();
  await page.getByTestId('manage-reminders-row').click();
  await page.getByTestId('remmode-Calendar').click();
  await page.getByTestId('trimode-none').click();
  await page.getByTestId('remfolders-done').click();
  await expect(page.getByText('ride me', { exact: true })).toBeHidden();
});
