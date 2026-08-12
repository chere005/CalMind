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

test("a section's + lands in the editor TYPING, not just open", async ({ page }) => {
  // Sean, twice, both meaning the same thing: making a note should end with
  // the cursor in it. The editor already auto-opened; the body field did not.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('straight to typing');
  // The body edit field itself, focused — not the read view.
  await expect(page.getByTestId('note-body-edit')).toBeVisible();
  await expect(page.getByTestId('note-body-edit')).toBeFocused();
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
  // Assert the field HOLDS the name before navigating away. Without this the
  // spec raced note creation: one run in three left the row showing its
  // default 'Aug 10, 2026 at 5:26pm' title, and the failure pointed at the
  // drag rather than at the setup that had not finished.
  await adds.first().click();
  await page.getByTestId('note-title').fill('first note');
  await expect(page.getByTestId('note-title')).toHaveValue('first note');
  await page.getByTestId('note-back').click(); // the editor auto-opens on create
  await adds.nth(1).click();
  await page.getByTestId('note-title').fill('second note');
  await expect(page.getByTestId('note-title')).toHaveValue('second note');
  await page.getByTestId('note-back').click();
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
  await page.getByTestId('note-title').fill('styled');
  // The editor auto-opens. Tap the body, type markers, then tap the title.
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
  // The PAGE's background follows too, not just the app's own view. It is
  // what shows through the safe areas, so a body left at midnight under a
  // cream app is Sean's white-band bug with the colours swapped.
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bodyBg()).toBe('rgb(17, 17, 17)');
  await page.getByTestId('theme-sage').click();
  await expect.poll(pageBg).toBe('rgb(254, 250, 224)'); // sage #fefae0
  await expect.poll(bodyBg, { timeout: 10_000 }).toBe('rgb(254, 250, 224)');
  // The pick is a synced pref: a reload comes back cream.
  await page.reload();
  await expect.poll(pageBg, { timeout: 10_000 }).toBe('rgb(254, 250, 224)');
  await expect.poll(bodyBg, { timeout: 10_000 }).toBe('rgb(254, 250, 224)');
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

test('edit mode is left by tapping out — there is no Done button', async ({ page }) => {
  // Sean removed the Done pill: it was itself the last of the vertical shift
  // he was complaining about. Tapping out is now the ONLY way out, so it has
  // to work when the list fills the screen and there is no blank space —
  // which is why the folder and section HEADERS are exit targets too.
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('escape me');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.keyboard.press('Escape');

  // The FOLDER header — always on screen, whatever the list length.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'escape me' }));
  await expect(page.getByTestId('rem-dup').first()).toBeVisible();
  await page.getByTestId('head-fold-Reminders').click();
  await expect(page.getByTestId('rem-dup')).toBeHidden();

  // The SECTION header, the other always-present surface.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'escape me' }));
  await expect(page.getByTestId('rem-dup').first()).toBeVisible();
  await page.getByTestId('head-sec-General').first().click();
  await expect(page.getByTestId('rem-dup')).toBeHidden();

  // And blank space below the list, for when there is some.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'escape me' }));
  await expect(page.getByTestId('rem-dup').first()).toBeVisible();
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 120);
  await expect(page.getByTestId('rem-dup')).toBeHidden();

  // The row's own inline field must NOT close it — that is the thing being
  // edited, and it is a real <input>, which is what reaches the rule at all.
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'escape me' }));
  await expect(page.getByTestId('rem-edit')).toBeVisible();
  await page.getByTestId('rem-edit').click();
  await expect(page.getByTestId('rem-edit')).toBeVisible();
  await expect(page.getByTestId('rem-dup').first()).toBeVisible();
});

test("the calendar panel's edit mode can be left at all", async ({ page }) => {
  // Once the worst of the three: setPanelEdit(false) appeared exactly once in
  // the whole file, in the Escape handler, so a phone had no way out at all.
  // There is no Done button here either — "+ Add" stays put, since swapping
  // it was a control appearing and disappearing in the row Sean did not want
  // moving.
  await signup(page);
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('dentist');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('dentist')).toBeVisible();

  await longPress(page, page.getByText('dentist'));
  await expect(page.getByTestId('cal-completed')).toBeVisible();
  // The day's own title is a label, not a control: tapping it leaves.
  await page.getByTestId('cal-day-title').click();
  // The row controls are gone again — the panel is out of edit mode.
  await expect(page.getByTestId('dp-note-row')).toHaveCount(0);
  await expect(page.getByTestId('cal-add')).toBeVisible();
});

test('Notes edit mode is left by tapping out, exactly as Reminders is', async ({ page }) => {
  // Three screens, one gesture. The Done pill is gone from here too.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('leave me');
  await expect(page.getByTestId('note-title')).toHaveValue('leave me');
  await page.getByTestId('note-back').click();

  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'leave me' }));
  await expect(page.getByTestId('note-dup')).toBeVisible();
  await page.getByTestId('head-fold-General').click();
  await expect(page.getByTestId('note-dup')).toBeHidden();

  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'leave me' }));
  await expect(page.getByTestId('note-dup')).toBeVisible();
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 120);
  await expect(page.getByTestId('note-dup')).toBeHidden();
});

test('the 12/24-hour setting reaches the screens, and survives a reload', async ({ page }) => {
  // One setting on 'suite', which every surface is supposed to honour. The
  // watch and the widget cannot read a pref record — the flag rides in
  // watchFeed and their own checks cover them — so this pins the two the
  // browser CAN see, plus the fact that it syncs rather than living in this
  // tab only.
  const user = await signup(page);
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  // The time goes in the text, which is how a person types it here.
  await page.getByPlaceholder(/What\?/).fill('standup 2pm');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('2pm', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Switch to 24-hour in Settings — through the username menu, as a person
  // does, since there is no direct testid for it.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('clock-24').click();
  await page.getByLabel('Done').click();
  await expect(page.getByText('14:00', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('2pm', { exact: true })).toBeHidden();

  // It is a synced pref, not a tab-local toggle: it survives a reload.
  await page.reload();
  await expect(page.getByText('14:00', { exact: true })).toBeVisible({ timeout: 15_000 });

  // …and back again, so the default is reachable too.
  await page.getByText(user, { exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await page.getByTestId('clock-12').click();
  await page.getByLabel('Done').click();
  await expect(page.getByText('2pm', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('Habits enters edit mode by HOLDING, and leaves by tapping outside', async ({ page }) => {
  // Sean: Habits does not need an edit button — hold a habit or a section to
  // enter, tap outside to leave, like the other three screens. It was the one
  // screen with a pencil, which is the sort of difference nobody remembers.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByTestId('habit-add-Habits').first().click();
  await page.getByTestId('habit-name-field').fill('stretch');
  await page.getByTestId('habit-save').click();
  await page.keyboard.press('Escape');

  // The edit-only controls are away until something is held. There is
  // deliberately no assertion that the PENCIL is absent: testids.spec catches
  // an absence assertion on a testID nothing renders, because such a check
  // passes whether the control was removed or merely renamed. What the pencil
  // did is what matters, and that is what the rest of this test drives.
  await expect(page.getByTestId('habit-grip').first()).toBeHidden();

  // Holding a SECTION enters edit mode without renaming anything.
  await longPress(page, page.locator('[data-testid^="hsec-name-"]').first());
  await expect(page.getByTestId('habit-grip').first()).toBeVisible();

  // A tap on something inert leaves it.
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 140);
  await expect(page.getByTestId('habit-grip').first()).toBeHidden();

  // …and the section HEADER leaves it too, which is the exit that has to work
  // when the grid fills the screen and there is no inert space to tap. Sean
  // asked for the three screens to behave identically; Reminders and Notes
  // are pinned on their headers, so Habits is pinned on its.
  await longPress(page, page.locator('[data-testid^="hsec-name-"]').first());
  await expect(page.getByTestId('habit-grip').first()).toBeVisible();
  await page.getByTestId('head-sec-Habits').click();
  await expect(page.getByTestId('habit-grip').first()).toBeHidden();

  // Holding a HABIT enters it too — Sean named both.
  await longPress(page, page.getByTestId('habit-name').first());
  await expect(page.getByTestId('habit-grip').first()).toBeVisible();
});

test('the CALENDAR day panel leaves edit mode by tapping out, like the other three', async ({ page }) => {
  // The fourth screen with this rule, and the only one that had no test for
  // it. Calendar.tsx's own comment records why that mattered: setPanelEdit
  // (false) once appeared exactly ONCE in the file, in the Escape handler, so
  // on a phone there was no way out of the day panel's edit mode at all. The
  // fix shipped uncovered, which is the same as untested.
  //
  // A dated NOTE is the seeding route because it reaches the panel through
  // core rather than through this screen's own add modal.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('panel exit');
  await expect(page.getByTestId('note-title')).toHaveValue('panel exit');
  await page.getByTestId('note-back').click();
  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'panel exit' }));
  await page.getByTestId('note-date-panel exit').click();
  await page.getByTestId('note-date-today').click();
  await page.getByTestId('note-date-done').click();

  await page.getByTestId('tab-calendar').click();
  const row = page.getByTestId('dp-note-row').filter({ hasText: 'panel exit' });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Edit mode is marked by the row's own controls; Duplicate is edit-only.
  const dup = page.getByLabel('Duplicate').first();
  await expect(dup).toBeHidden();

  // The day's TITLE exits. Calendar.tsx names this case specifically: a
  // '[data-testid^="cal-"]' allow-list was tried and rejected because it kept
  // the title, which is a label, not a control.
  await longPress(page, row);
  await expect(dup).toBeVisible();
  await page.getByTestId('cal-day-title').click();
  await expect(dup).toBeHidden();

  // The panel HEAD's dead space — the always-present surface, and the one
  // that has to work when the day is full and no blank space is left. The
  // sweep measured this row at 32pt tall with ~145pt of dead space between
  // the title and the first button, which is a larger target than the header
  // strips the other three screens exit through.
  await longPress(page, row);
  await expect(dup).toBeVisible();
  const gap = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="cal-day-title"]')!;
    const head = t.parentElement!;
    const btns = [...head.querySelectorAll('[role="button"]')].map((e) => e.getBoundingClientRect().left);
    const r = head.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    return { x: (tr.right + Math.min(...btns)) / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(gap.x, gap.y);
  await expect(dup).toBeHidden();

  // …and the grid does NOT exit, because picking another day while arranging
  // one is a thing you do. This is the half that proves the rule discriminates
  // rather than closing on every click.
  await longPress(page, row);
  await expect(dup).toBeVisible();
  await page.getByTestId('cal-grid').click({ position: { x: 5, y: 5 } });
  await expect(dup).toBeVisible();
});

test('a note takes a date from the LIST, and the calendar opens it for editing', async ({ page }) => {
  // Sean's three: a calendar icon beside duplicate so a date can be put on a
  // note without opening it; the mini editor with exactly remove / today /
  // done; and tapping a note in the calendar opening it straight into
  // editing rather than a read view.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('dated note');
  await expect(page.getByTestId('note-title')).toHaveValue('dated note');
  await page.getByTestId('note-back').click();

  // The icon lives in EDIT mode, beside duplicate.
  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'dated note' }));
  await page.getByTestId('note-date-dated note').click();

  // Exactly three controls, and 'today' is the one that sets a date.
  await expect(page.getByTestId('note-date-clear')).toBeVisible();
  await expect(page.getByTestId('note-date-today')).toBeVisible();
  await expect(page.getByTestId('note-date-done')).toBeVisible();
  await page.getByTestId('note-date-today').click();
  await page.getByTestId('note-date-done').click();

  // It reaches the CALENDAR, which is the point of putting a date on a note.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByText('dated note')).toBeVisible({ timeout: 10_000 });

  // …and tapping it there opens the note's EDITOR, not the notes list.
  await page.getByTestId('dp-note-row').filter({ hasText: 'dated note' }).click();
  await expect(page.getByTestId('note-title')).toHaveValue('dated note');

  // The editor's back returns to the CALENDAR, since that is where we came
  // from — the whole reason it stopped saying "All notes".
  await page.getByTestId('note-back').click();
  await expect(page.getByTestId('cal-grid')).toBeVisible({ timeout: 10_000 });

  // …and the button beside it still goes straight to the list, which is the
  // destination back no longer guarantees. Both, as Sean asked.
  await page.getByTestId('dp-note-row').filter({ hasText: 'dated note' }).click();
  await expect(page.getByTestId('note-title')).toHaveValue('dated note');
  await page.getByTestId('note-all').click();
  await expect(page.getByTestId('note-row').filter({ hasText: 'dated note' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('cal-grid')).toHaveCount(0);

  // A TYPED date has to parse. It was written into payload.date verbatim, so
  // "8/12" stayed "8/12" while every comparison in the app is against
  // YYYY-MM-DD — the note simply never appeared on the day it claimed. It
  // goes through the same parseDateField the note editor's own field uses.
  await page.getByTestId('tab-notes').click();
  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'dated note' }));
  await page.getByTestId('note-datechip-dated note').click();
  await page.getByTestId('note-date-field').fill('12/25');
  await page.getByTestId('note-date-field').press('Enter');
  await page.getByTestId('note-date-done').click();
  // Stored as a real date, not as the characters typed.
  await expect(page.getByTestId('note-datechip-dated note')).toHaveText(/^\d{4}-12-25$/);

  // The DATE CHIP is the other way into the editor — Sean asked for tapping
  // an existing date to open it, not only the icon.
  await longPress(page, page.getByTestId('note-row').filter({ hasText: 'dated note' }));
  await page.getByTestId('note-datechip-dated note').click();
  await expect(page.getByTestId('note-date-clear')).toBeVisible();

  // And CLEAR actually removes the date — the one control of the three that
  // nothing had driven. Proven by its absence from the calendar afterwards,
  // which is what a date on a note is FOR.
  await page.getByTestId('note-date-clear').click();
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByText('dated note')).toHaveCount(0);
});

test('collapse-all folds and unfolds, on the list AND on the calendar', async ({ page }) => {
  // The control exists on all four tabs and nothing drove it: chevrons.spec
  // checks it is the right GLYPH and the right box, which says nothing about
  // whether pressing it folds anything. Calendar's is new — it was the one
  // tab without one, which is the only thing the top-bar measurement found
  // to be inconsistent.
  await signup(page);

  // Reminders: folding the sections takes the rows with them.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('fold me');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByText('fold me')).toBeVisible();
  await page.getByLabel('Collapse all').click();
  await expect(page.getByText('fold me')).toBeHidden();
  // The arrow turns around, so the control says which way it will go next.
  await page.getByLabel('Expand all').click();
  await expect(page.getByText('fold me')).toBeVisible();

  // Calendar: the same control folds the day panel's groups.
  await page.getByTestId('tab-calendar').click();
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-event').click();
  await page.getByPlaceholder(/What\?/).fill('fold this event');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByText('fold this event')).toBeVisible();
  await page.getByLabel('Collapse all').click();
  await expect(page.getByText('fold this event')).toBeHidden();
  await page.getByLabel('Expand all').click();
  await expect(page.getByText('fold this event')).toBeVisible();
});

test('a note made from Add opens its editor, and Back returns to Add', async ({ page }) => {
  // The other route into the note editor from another tab. Back now returns
  // to where you came from, and "where" is whatever the tab stack popped —
  // so this pins the Add route as well as the calendar one. If the stack were
  // empty the editor would close to the notes LIST with the tab unchanged,
  // which is the stuck-looking case worth having a test for.
  await signup(page);
  await page.getByTestId('tab-add').click();
  // The Add screen's own kind cards, which carry no testids — picked by the
  // word on them, as a person does.
  await page.getByText('Note', { exact: true }).click();
  await page.getByPlaceholder(/Dentist/).fill('from the add sheet');
  await page.getByText('Done', { exact: true }).click();

  // It lands in the editor, not the list.
  await expect(page.getByTestId('note-title')).toHaveValue('from the add sheet', { timeout: 10_000 });

  // …and Back goes to Add, the tab it came from — the Add screen's own help
  // line is the thing only that tab shows.
  await page.getByTestId('note-back').click();
  await expect(page.getByText('You can also type the date and time into the line:')).toBeVisible({ timeout: 10_000 });
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

  // Sean's screenshot: the partner's badge sat between two segments of the
  // folder's divider, so it read as a label on the LINE rather than on the
  // folder, and their sections sat flush left while mine were indented.
  //
  // Mine are pushed in by the drag grip they carry — invisible outside edit
  // mode but still 16pt wide, plus the head's 8pt gap. A partner's sections
  // have no grip to push them, which is why reading one paddingLeft would not
  // have told anyone what the screen looks like. Measured instead.
  const badge = (await pageB.getByTestId('shared-owner-badge').first().boundingBox())!;
  const rule = (await pageB.getByTestId('shared-folder-rule').first().boundingBox())!;
  expect(badge.x + badge.width, 'the partner badge sits LEFT of the divider').toBeLessThanOrEqual(rule.x + 2);

  // The CHEVRONS, not their containers: my fold control is a chevron inside a
  // head that also holds the grip, while a partner's head IS the control. The
  // two boxes start in different places by construction, so comparing them
  // measures the markup rather than the alignment anyone can see.
  const theirs = (await pageB.getByTestId('shared-secfold-General').locator('svg').first().boundingBox())!;
  const mineBox = (await pageB.getByTestId('secfold-General').locator('svg').first().boundingBox())!;
  expect(Math.abs(theirs.x - mineBox.x), "a partner's sections line up with my own").toBeLessThanOrEqual(2);

  // The ROWS under those headers, which the first pass missed: fixing the
  // section heads alone left every shared row hanging out past its own
  // header. Mine lead with a drag grip (16) plus the row's gap; theirs have
  // no grip. Measured on the ticks, which is the leftmost thing in both.
  //
  // B needs a row of their OWN to compare against — up to here B has only
  // ever looked at A's list, so there was nothing to line up with.
  await pageB.getByTestId('secadd-General').first().click();
  await pageB.getByTestId('rem-add-field').fill('my own row');
  await pageB.getByTestId('rem-add-field').press('Enter');
  await pageB.keyboard.press('Escape');
  await expect(pageB.getByText('my own row')).toBeVisible();
  const theirTick = (await pageB.getByTestId('all-shared-tick').first().boundingBox())!;
  const myTick = (await pageB.getByTestId('tick').first().boundingBox())!;
  expect(Math.abs(theirTick.x - myTick.x), "a partner's rows line up with my own").toBeLessThanOrEqual(2);

  // A partner's SECTION folds, not just their folder. Sean asked for this
  // because the folder was the only handle: putting one section away meant
  // putting the whole partner away. The fold is B's own — device-local, never
  // written to A's store — so A must be unaffected, which is what the last
  // assertion here is for.
  await pageB.getByTestId('shared-secfold-General').first().click();
  await expect(pageB.getByText('chop onions')).toBeHidden({ timeout: 5_000 });
  await pageB.getByTestId('shared-secfold-General').first().click();
  await expect(pageB.getByText('chop onions')).toBeVisible({ timeout: 5_000 });
  // A still sees their own row: B folding it away is a view, not an edit.
  await pageA.getByTestId('tab-reminders').click();
  await expect(pageA.getByText('chop onions')).toBeVisible({ timeout: 10_000 });

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
  await pageA.getByTestId('note-back').click();
  await pageA.getByTestId('tab-notes').click();
  await pageA.getByTestId('secadd-General').first().click();
  await pageA.getByTestId('note-title').fill('the recipe');
  await pageA.getByTestId('note-body-edit').fill('**garlic** first');
  await pageA.getByTestId('note-back').click();
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

  // A recipe someone SHARES with you is still a recipe to cook from, so the
  // scale sits on this screen too. It was missing here at first: the shared
  // view is a second copy of the note renderer, and it is the copy that is
  // easy to forget.
  await pageA.getByTestId('note-body-view').click();
  await pageA.getByTestId('note-body-edit').fill('**Ingredients**\n- 2 cups flour\n- 3 egg yolks');
  await pageA.getByTestId('note-title').click();
  await pageA.waitForTimeout(2_000);
  await pageB.reload();
  await pageB.getByTestId('tab-notes').click();
  await pageB.getByTestId('pick-notes').click();
  await pageB.getByTestId('pick-shared-General').click();
  await pageB.getByTestId('shared-note-row').filter({ hasText: 'the recipe' }).click();
  await expect(pageB.getByTestId('shared-scale-row')).toBeVisible({ timeout: 10_000 });
  await pageB.getByTestId('shared-scale-double').click();
  const shared = pageB.getByTestId('shared-note-body');
  await expect(shared).toContainText('4 cups flour');
  await expect(shared, 'the compound noun keeps its head').toContainText('6 egg yolks');
  // And a scaled view is not an editor, here either.
  await shared.click();
  await expect(pageB.getByTestId('shared-note-edit')).toHaveCount(0);

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
  // The unit pills render from core's REPEAT_UNITS now, not a literal copy of
  // it, so this asserts the list REACHES the screen: an empty or missing
  // constant draws no pills at all. The test used to accept the default
  // { n: 1, unit: 'week' } and never touch them, so it would not have noticed.
  // The four are written out here rather than imported — a test that reads its
  // expectation from the same constant as the code agrees with it by
  // construction.
  for (const u of ['day', 'week', 'month', 'year']) {
    await expect(page.getByText(u, { exact: true }).first()).toBeVisible();
  }
  // …and that they are live. 'month' is deliberately not the default, so a
  // pill that renders but does not respond still fails here.
  const monthPill = page.getByText('month', { exact: true }).first();
  await monthPill.click();
  const bgOf = (t: string) =>
    page.getByText(t, { exact: true }).first()
      .evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  expect(await bgOf('month')).not.toBe(await bgOf('day'));
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

test('unticking Include notes shows what it would drop, rather than hiding it', async ({ page }) => {
  // The leftovers are not always trivia. Most of Sean's cards write the method
  // as prose with no heading, so it lands in the leftovers rather than in the
  // steps — and unticking used to HIDE those lines at exactly the moment Save
  // was about to drop them.
  const user = await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Uovo');
  await page.getByTestId('note-body-edit').fill(
    'Ingredients\n200 g farina 00\n2 eggs\nForm a well with the flour and knead it.\nDo whatever you want with it.',
  );
  await page.getByTestId('note-title').click();
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });

  // Ticked: the lines are listed and no warning is needed.
  // Two matches: the leftovers list and the ingredient row it also parses
  // into. The leftovers line is the last one.
  await expect(page.getByText('Form a well with the flour and knead it.').last()).toBeVisible();
  await expect(page.getByTestId('recipe-dropping')).toHaveCount(0);

  // Unticked: still listed, struck through, and said out loud.
  await page.getByTestId('recipe-incnotes').click();
  await expect(page.getByTestId('recipe-dropping')).toContainText('will not be saved');
  await expect(
    page.getByText('Form a well with the flour and knead it.').last(),
    'you can still see what you are giving up',
  ).toBeVisible();
  expect(user).toBeTruthy();
});

test('habits shows five day columns on a phone and seven with room, paging without gaps', async ({ page }) => {
  // Sean's rule, made a real breakpoint rather than a permanent narrowing.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByTestId('habit-add-Habits').first().click();
  await page.getByTestId('habit-name-field').fill('stretch');
  await page.getByTestId('habit-save').click();

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
  // The page's own background, which is what shows through the safe areas.
  // Unset means white — that is how a white band appeared under the tab bar
  // the moment viewport-fit=cover let the page reach the home indicator.
  const paint = () => page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  const clear = ['rgba(0, 0, 0, 0)', 'transparent', 'rgb(255, 255, 255)'];
  const bg = await paint();
  expect(clear, 'the page paints its own background').not.toContain(bg.html);
  expect(clear, 'and the body too').not.toContain(bg.body);

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
    await page.getByTestId('habit-add-Habits').first().click();
    await page.getByTestId('habit-name-field').fill(name);
    await page.getByTestId('habit-save').click();
  }
  const names = page.getByTestId('habit-grip');
  await expect(names).toHaveCount(3);

  // Edit mode is entered by HOLDING a habit — the pencil is gone.
  await longPress(page, page.getByTestId('habit-name').first());
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

test('in edit mode a habit opens its editor, and out of it a tap does nothing', async ({ page }) => {
  // Sean, 2026-08-11: holding a habit no longer types over its name. It turns
  // edit mode on and reveals a pencil, and the pencil — or a single tap on the
  // row while editing — opens the small Name + Frequency screen. This test
  // used to assert the inline rename it replaced.
  await signup(page);
  await page.getByTestId('tab-habits').click();
  await page.getByTestId('habit-add-Habits').first().click();
  await page.getByTestId('habit-name-field').fill('stretch');
  await page.getByTestId('habit-save').click();
  await expect(page.getByTestId('habit-name')).toHaveText('stretch');

  // Out of edit mode a tap on the name does nothing at all.
  await page.getByTestId('habit-name').click();
  await expect(page.getByText('Edit habit')).toHaveCount(0);

  // Holding turns edit mode on and shows the pencil beside the delete.
  await longPress(page, page.getByTestId('habit-name').first());
  await expect(page.getByTestId('habit-edit').first()).toBeVisible();

  // A single tap on the row now opens the editor, as the pencil does.
  await page.getByTestId('habit-name').first().click();
  await expect(page.getByText('Edit habit')).toBeVisible();
  await page.getByTestId('habit-name-field').fill('stretch daily');
  await page.getByTestId('habit-save').click();
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

test('Notes can make a section at all — the folder head carries the +', async ({ page }) => {
  // It couldn't. Reminders had the folder-head + and Notes didn't, so the
  // only note section you could ever have was the one normalize seeds. The
  // suite carries that + in BOTH apps, and shows it outside edit mode.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('foldadd-General').first().click();
  await page.getByPlaceholder('New section').fill('Recipes');
  await page.getByPlaceholder('New section').press('Enter');
  await expect(page.getByTestId('secadd-Recipes')).toBeVisible();

  // It's a real section: a note files into it and lands there after a reload.
  await page.getByTestId('secadd-Recipes').first().click();
  await page.getByTestId('note-title').fill('pancakes');
  await page.getByTestId('note-back').click();
  await page.reload();
  await page.getByTestId('tab-notes').click();
  await expect(page.getByTestId('secadd-Recipes')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('note-row').filter({ hasText: 'pancakes' })).toBeVisible();
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

test('the Add page tells you the words it understands', async ({ page }) => {
  // A parser nobody knows about is a parser nobody uses. The help block listed
  // only 8/3 and 2pm for a while after the relative words landed, which made
  // the whole feature undiscoverable.
  await signup(page);
  await page.getByTestId('tab-add').click();
  const help = page.getByText('You can also type the date and time into the line:');
  await expect(help).toBeVisible();
  const block = page.locator('body');
  for (const word of ['tomorrow', 'in 2 weeks', 'in an hour', 'in 30mins']) {
    await expect(block, `the help names "${word}"`).toContainText(word);
  }
  // …and the rule a bare time follows, since that one surprises people.
  await expect(block).toContainText('already gone by');
});

test('the little date box takes "tomorrow" too, not just 8/3', async ({ page }) => {
  // The text field beside it learned the relative words this run; a box that
  // refused what its neighbour accepts is a seam a person walks straight into.
  await signup(page);
  await page.getByText('+ Add', { exact: true }).click();
  await page.getByTestId('kind-reminder').click();
  await page.getByPlaceholder(/What\?/).fill('call the vet');
  await page.getByPlaceholder('m/d').fill('tomorrow');
  await page.getByText('Save', { exact: true }).click();

  const tomorrow = new Date(Date.now() + 86_400_000);
  const chip = tomorrow.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  await page.getByTestId('tab-reminders').click();
  const row = page.getByTestId('rem-row').filter({ hasText: 'call the vet' });
  await expect(row).toBeVisible();
  await expect(row).toContainText(chip);
});

test('a recipe line is mended by tapping it, not by deleting and retyping', async ({ page }) => {
  // OCR hands you typos by the handful. Before this the only way to fix one
  // was to delete the row and type the whole line again — on a phone, the
  // difference between correcting a recipe and abandoning it.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flur\n1. Mix it');
  await page.getByTestId('recipe-import').click();

  await page.getByTestId('ing-row').first().click();
  const field = page.getByTestId('ing-edit');
  await expect(field).toBeVisible();
  await field.fill('3 cups flour');
  await field.press('Enter');
  // The measure moved into the row's badge, so the text reads name-then-chip.
  await expect(page.getByTestId('ing-row').first()).toContainText('flour');
  await expect(page.getByTestId('ing-unit').first()).toHaveText('3 cups');

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
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk\n3 eggs');
  await page.getByTestId('recipe-import').click();

  const rows = () => page.getByTestId('ing-row').allTextContents();
  await expect.poll(rows).toEqual(['flour2 cups', 'milk1 cup', 'eggs3']);
  // The Recipe page slides in; measuring a grip mid-animation aims the drag
  // at where the row USED to be.
  await page.waitForTimeout(400);

  const grips = page.getByTestId('ing-grip');
  const g0 = (await grips.nth(0).boundingBox())!;
  const g2 = (await grips.nth(2).boundingBox())!;
  await dragVert(page, grips.first(), g2.y + g2.height / 2 - (g0.y + g0.height / 2) + 8);
  await expect.poll(rows).toEqual(['milk1 cup', 'eggs3', 'flour2 cups']);

  // The order is what gets saved, not merely what is drawn.
  await page.getByTestId('recipe-save').click();
  await expect(page.getByTestId('note-body-view')).toContainText('1 cup milk');
  const body = await page.getByTestId('note-body-view').innerText();
  expect(body.indexOf('1 cup milk')).toBeLessThan(body.indexOf('2 cups flour'));
});

test('the Recipe page says how its lines are handled', async ({ page }) => {
  // Three gestures live on one line — tap to edit, drag the marker to reorder,
  // swipe to delete — and the drag handle is the bullet itself, which looks
  // like punctuation. The suite puts a hint under a draggable list; so does
  // this, once there is more than one line to move.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk');
  await page.getByTestId('recipe-import').click();
  const hint = page.getByTestId('recipe-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('reorder');
  await expect(hint).toContainText('swipe');
});

test('a recipe line deletes by swiping it, not by a × parked on every row', async ({ page }) => {
  // Every other list in the app hides delete behind the swipe. On a page whose
  // rows are also tappable to edit and draggable to reorder, a permanent ×
  // was a third thing competing for one line — and a destructive one.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  await page.getByTestId('note-body-edit').fill('2 cups flour\n1 cup milk');
  await page.getByTestId('recipe-import').click();
  await expect.poll(() => page.getByTestId('ing-row').allTextContents()).toEqual(['flour2 cups', 'milk1 cup']);
  await page.waitForTimeout(400); // the page slides in

  await expect(page.getByTestId('ing-del')).toHaveCount(0); // nothing parked
  const row = page.getByTestId('ing-row').first();
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, y);
  await page.mouse.up();
  // The swipe counts as the first press, so one tap finishes it.
  await page.getByTestId('ing-del').click();
  await expect.poll(() => page.getByTestId('ing-row').allTextContents()).toEqual(['milk1 cup']);
});

test('the Recipe page can shed the non-recipe notes with its checkbox', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  // The editor auto-opens; give the body a recipe plus one free-text line.
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
  // The chip says what the row IS, not the rule that produced it. It read
  // "every day" — true of the rule, and the wrong thing to tell someone
  // looking at one particular day. Sean's wording.
  await expect(page.getByTestId('rider-chip')).toHaveText('today');
  // Manage reminders → Calendar folder → None.
  await page.getByTestId('pick-calendar').click();
  await page.getByTestId('manage-reminders-row').click();
  await page.getByTestId('remmode-Calendar').click();
  await page.getByTestId('trimode-none').click();
  await page.getByTestId('remfolders-done').click();
  await expect(page.getByText('ride me', { exact: true })).toBeHidden();
});

test('every repeat editor draws core’s unit list — Add and the inline row, not just the modal', async ({ page }) => {
  // There are THREE repeat editors and only ItemModal's had a test, reached
  // through rem-pencil. The other two read the same REPEAT_UNITS now, and a
  // source sweep in testids.spec stops a literal copy coming back — but that
  // guards the source, not the screen. Nothing until now had opened these two
  // and looked.
  await signup(page);
  const bgOf = (t: string) =>
    page.getByText(t, { exact: true }).first()
      .evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);

  // 1 — the Add screen's editor.
  await page.getByTestId('tab-add').click();
  await page.getByText('+ Repeat', { exact: true }).click();
  for (const u of ['day', 'week', 'month', 'year']) {
    await expect(page.getByText(u, { exact: true }).first()).toBeVisible();
  }
  await page.getByText('month', { exact: true }).first().click();
  expect(await bgOf('month'), 'Add: the picked unit is the selected one').not.toBe(await bgOf('day'));

  // 2 — the inline editor on a Reminders row, which opens with the row itself.
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('rem-add-field').fill('repeat me');
  await page.getByTestId('rem-add-field').press('Enter');
  await page.keyboard.press('Escape');
  await longPress(page, page.getByTestId('rem-body').filter({ hasText: 'repeat me' }));
  for (const u of ['day', 'week', 'month', 'year']) {
    await expect(page.getByText(u, { exact: true }).first()).toBeVisible();
  }
  await page.getByText('month', { exact: true }).first().click();
  expect(await bgOf('month'), 'inline row: the picked unit is the selected one').not.toBe(await bgOf('day'));
});
