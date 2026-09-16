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
