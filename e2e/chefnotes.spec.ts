import { expect, test, type Page } from '@playwright/test';

/**
 * ChefMind's recipes, drawn in Notes under the chef's hat — and edited there.
 *
 * Sean, 2026-09-15: "sync recipes in ChefMind and CalMind… recipes show up in
 * CalMind as notes sections with a chef hat icon to the right to indicate they
 * are coming from ChefMind." ChefMind keeps its store in a second sync SPACE
 * of the same account (`space: 'chef'` on the sync request), so this spec
 * seeds that space straight through the API as ChefMind itself would, then
 * checks two things the screen alone cannot prove:
 *
 *   1. the recipe is DRAWN — its folder wears the ChefMind badge, its section
 *      the hat, its row opens the ordinary editor;
 *   2. opening one WRITES NOTHING — not to ChefMind's space, not to mine.
 *      Sean, later the same day: "disable editing ChefMind recipes from
 *      CalMind." A build that still routed a tap into the editor would look
 *      right on screen and change ChefMind's store, so both stores are read
 *      back over the API.
 */
const API = 'http://127.0.0.1:8790/calmind/api/index.php';
const SESSION_KEY = 'calmind.session@127.0.0.1_8790_calmind';

/** A long press, which is how the Notes list arms edit mode. */
async function longPress(page: Page, locator: ReturnType<Page['getByTestId']>) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

async function signup(page: Page): Promise<string> {
  const user = `ch${Date.now()}`;
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

async function token(page: Page): Promise<string> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), SESSION_KEY);
  return (JSON.parse(raw!) as { token: string }).token;
}

type Rec = { id: string; type: string; updated: number; deleted?: boolean; payload: Record<string, unknown> };

/** One sync round trip against a space, as a client would make it. */
async function sync(page: Page, tok: string, space: string, changes: Rec[] = []): Promise<Rec[]> {
  const res = await page.request.post(API, {
    headers: { Authorization: `Bearer ${tok}` },
    data: { action: 'sync', ...(space ? { space } : {}), cursor: 0, changes },
  });
  const body = (await res.json()) as { ok: boolean; changes: Rec[] };
  expect(body.ok, `sync ${space || 'mine'} answered ok`).toBe(true);
  return body.changes;
}

test("ChefMind's recipes show under the hat, read-only — opening one writes nothing anywhere", async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  const tok = await token(page);

  // ChefMind's store: a notes folder, a section, one recipe — exactly the
  // three records ChefMind writes, minted here so the ids are known.
  const now = Date.now();
  const folder: Rec = { id: 'cf0000000001', type: 'folder', updated: now, payload: { name: 'Recipes', color: '#7dc2ed', ord: 'V', app: 'notes' } };
  const section: Rec = { id: 'cs0000000001', type: 'section', updated: now, payload: { name: 'Pasta', folderId: folder.id, ord: 'V' } };
  const recipe: Rec = { id: 'cn0000000001', type: 'note', updated: now, payload: { title: 'Cacio e Pepe', body: 'Pecorino, pepper, pasta water.', date: null, folderId: folder.id, sectionId: section.id, ord: 'V' } };
  await sync(page, tok, 'chef', [folder, section, recipe]);

  // Pull it in and look. A reload is the sync that is easiest to wait on:
  // boot restores the session and syncs both spaces before the tabs draw.
  // (The sync DOT is a tap target for the account menu, not a sync button —
  // pressing it opens a sheet over the tabs.)
  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  await expect(page.getByTestId('chef-folder-badge'), 'the folder wears the ChefMind badge').toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chef-hat-Pasta'), 'the section carries the hat, right of its name').toBeVisible();
  const row = page.getByTestId('chef-note-row').filter({ hasText: 'Cacio e Pepe' });
  await expect(row).toBeVisible();

  // The hat sits RIGHT of the name.
  const nameBox = (await page.getByText('Pasta', { exact: true }).boundingBox())!;
  const hatBox = (await page.getByTestId('chef-hat-Pasta').boundingBox())!;
  expect(hatBox.x, 'hat is right of the section name').toBeGreaterThan(nameBox.x + nameBox.width - 1);

  // Open it: a READER, not the editor (Sean, later that day: "disable editing
  // ChefMind recipes from CalMind"). No title field, no body editor, no +.
  await row.click();
  await expect(page.getByTestId('chef-note-view')).toBeVisible();
  await expect(page.getByTestId('chef-note-title')).toHaveText('Cacio e Pepe');
  await expect(page.getByTestId('chef-note-body')).toContainText('Pecorino');
  await expect(page.getByTestId('note-title'), 'no title field on a ChefMind recipe').toHaveCount(0);
  await expect(page.getByTestId('note-body-view'), 'no body editor either').toHaveCount(0);
  await page.getByTestId('chef-note-back').click();
  await expect(row).toBeVisible();
  await expect(page.getByTestId(/^chef-secadd-/), 'no + on a ChefMind section').toHaveCount(0);

  // Nothing was written anywhere: ChefMind's record is byte-for-byte what was
  // seeded (same stamp), and my own store never gained a copy.
  await page.waitForTimeout(2500); // past the store's 800ms push debounce, had anything been dirty
  const chef = await sync(page, tok, 'chef');
  const held = chef.find((r) => r.id === recipe.id)!;
  expect(held.updated, "ChefMind's recipe was not touched").toBe(now);
  expect(held.payload['title']).toBe('Cacio e Pepe');
  expect(chef.filter((r) => r.type === 'note').length, 'no recipe was added to ChefMind').toBe(1);
  const mine = await sync(page, tok, '');
  expect(mine.some((r) => r.id === recipe.id), 'the recipe was never copied into my own store').toBe(false);
  expect(mine.some((r) => r.type === 'note' && r.payload['title'] === 'Cacio e Pepe')).toBe(false);
});

test('CalMind can date a ChefMind recipe; the date is CalMind\'s alone and the calendar still opens the recipe', async ({ page }) => {
  // Sean, 2026-09-16: "allow adding dates in CalMind to ChefMind entries…
  // showing up on the calendar is only known to CalMind, and still points to
  // the ChefMind recipe itself when opened from the calendar."
  //
  // Three claims, and the middle one is the one a screenshot cannot make:
  // the day goes into CalMind's own notes prefs, so ChefMind's store must
  // come back untouched and must never gain a pref of its own.
  test.setTimeout(120_000);
  await signup(page);
  const tok = await token(page);

  const now = Date.now();
  const folder: Rec = { id: 'df0000000001', type: 'folder', updated: now, payload: { name: 'Recipes', color: '#7dc2ed', ord: 'V', app: 'notes' } };
  const section: Rec = { id: 'ds0000000001', type: 'section', updated: now, payload: { name: 'Dinners', folderId: folder.id, ord: 'V' } };
  const recipe: Rec = { id: 'dn0000000001', type: 'note', updated: now, payload: { title: 'Red lentil dal', body: 'Lentils, cumin, ginger.', date: null, folderId: folder.id, sectionId: section.id, ord: 'V' } };
  await sync(page, tok, 'chef', [folder, section, recipe]);

  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  const row = page.getByTestId('chef-note-row').filter({ hasText: 'Red lentil dal' });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Edit mode is where a date is added, exactly as it is on my own notes —
  // and the recipe gets THAT control and no other: no grip, no duplicate, no
  // delete, because the recipe is still ChefMind's to change.
  await longPress(page, row);
  const dateBtn = page.getByTestId('chef-date-Red lentil dal');
  await expect(dateBtn, 'a recipe can be given a day').toBeVisible();
  await expect(page.getByTestId('note-dup'), 'and nothing else — a recipe is not duplicated from here').toHaveCount(0);
  await dateBtn.click();
  await page.getByTestId('note-date-today').click();
  await page.getByTestId('note-date-done').click();
  await expect(page.getByTestId('chef-datechip-Red lentil dal'), 'the row says which day').toBeVisible();

  // The calendar knows. The day panel grows a Recipes group on today.
  await page.getByTestId('tab-calendar').click();
  const calRow = page.getByTestId('dp-chef-row').filter({ hasText: 'Red lentil dal' });
  await expect(calRow, 'the planned recipe is on the day').toBeVisible({ timeout: 10_000 });

  // …and tapping it lands on the RECIPE — ChefMind's reader, not a note
  // editor. That is the whole point of routing the id back through the Notes
  // tab rather than opening something here.
  await calRow.click();
  await expect(page.getByTestId('chef-note-view')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('chef-note-title')).toHaveText('Red lentil dal');
  await expect(page.getByTestId('note-title'), 'still a reader, opened from the calendar').toHaveCount(0);

  // Nothing of this reached ChefMind. Its recipe carries the stamp it was
  // seeded with, and its space holds no pref record — the day lives in MY
  // notes prefs, which is what "only known to CalMind" means.
  await page.waitForTimeout(2500); // past the store's 800ms push debounce
  const chef = await sync(page, tok, 'chef');
  const held = chef.find((r) => r.id === recipe.id)!;
  expect(held.updated, "ChefMind's recipe was not touched").toBe(now);
  expect(held.payload['date'] ?? null, 'and it certainly did not gain a date').toBe(null);
  expect(chef.some((r) => r.type === 'pref'), 'no pref was written into ChefMind\'s space').toBe(false);

  const mine = await sync(page, tok, '');
  const pref = mine.find((r) => r.type === 'pref' && r.id.endsWith('notes'));
  expect(pref, 'the day is in MY notes prefs').toBeTruthy();
  expect((pref!.payload['chefDates'] as Record<string, string>)[recipe.id], 'keyed by the chef id').toBeTruthy();
  expect(mine.some((r) => r.id === recipe.id), 'the recipe was never copied into my own store').toBe(false);
});

test('a recipe is planned from the page you read it on, and the list says so without asking', async ({ page }) => {
  // Sean, 2026-09-18: "dates still need to be able to be added to recipes on
  // calmind so they show up on the calendar." It COULD be done before this,
  // and only by holding a row to arm edit mode and finding a 📅 on it — the
  // gesture for rearranging a list, for the one thing this app may do to
  // somebody else's recipe. The moment you want a day is while you are
  // reading what it takes to cook.
  test.setTimeout(120_000);
  await signup(page);
  const tok = await token(page);

  const now = Date.now();
  const folder: Rec = { id: 'pf0000000001', type: 'folder', updated: now, payload: { name: 'Recipes', color: '#7dc2ed', ord: 'V', app: 'notes' } };
  const section: Rec = { id: 'ps0000000001', type: 'section', updated: now, payload: { name: 'Dinners', folderId: folder.id, ord: 'V' } };
  const recipe: Rec = { id: 'pn0000000001', type: 'note', updated: now, payload: { title: 'Ribollita', body: 'Bread, beans, kale.', date: null, folderId: folder.id, sectionId: section.id, ord: 'V' } };
  await sync(page, tok, 'chef', [folder, section, recipe]);

  await page.reload();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  const row = page.getByTestId('chef-note-row').filter({ hasText: 'Ribollita' });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // An ordinary TAP — no hold, no edit mode.
  await row.click();
  await expect(page.getByTestId('chef-note-view')).toBeVisible();
  const plan = page.getByTestId('chef-plan');
  await expect(plan).toHaveText(/Plan a day/);
  await plan.click();
  await page.getByTestId('note-date-today').click();
  await page.getByTestId('note-date-done').click();
  await expect(plan, 'the page says which day it is planned for').toHaveText(/TODAY/);

  // Back on the list, the row says so with nothing held down.
  await page.getByTestId('chef-note-back').click();
  await expect(page.getByTestId('chef-datechip-Ribollita')).toBeVisible();
  await expect(page.getByTestId('chef-date-Ribollita'), 'and edit mode is still off').toHaveCount(0);

  // The calendar has it, and ChefMind has heard nothing.
  await page.getByTestId('tab-calendar').click();
  await expect(page.getByTestId('dp-chef-row').filter({ hasText: 'Ribollita' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2500); // past the store's 800ms push debounce
  const chef = await sync(page, tok, 'chef');
  expect(chef.find((r) => r.id === recipe.id)!.updated, "ChefMind's recipe was not touched").toBe(now);
  expect(chef.some((r) => r.type === 'pref'), 'no pref was written into ChefMind\'s space').toBe(false);
});
