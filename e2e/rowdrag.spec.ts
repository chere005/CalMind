/**
 * The row drag, where the SECTIONS are — the two faults Sean named on
 * 2026-09-19 ("dragging was buggy … when sections were closed and between
 * sections generally", then "make sure this bug doesn't appear in dragging on
 * any screen in any app").
 *
 * Both came from the flat list the drag indexes into:
 *
 *  · it held rows that are not drawn — everything inside a folded section, and
 *    on Notes and Reminders everything inside a folded FOLDER. rowdrag only
 *    measures entries that register a ref, so each hidden row was a hole, and
 *    every index below a collapsed thing pointed at a different row than the
 *    one under the finger.
 *
 *  · it had no section HEADERS in it, so the gap between the last row of one
 *    section and the first of the next was a single boundary spanning the
 *    header. "The end of this section" could not be expressed at all, and a
 *    row dragged to the bottom of its own section always joined the next one.
 *
 * Reminders is the screen tested here because it has both levels and the
 * cheapest rows; Notes and Habits build their lists the same way and read the
 * same landing rule out of the same file (apps/app/src/components/rowslots.ts,
 * held by apps/app/test/rowslots.test.ts).
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rd${Date.now()}${seq++}`;
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

/** Hold a row: the way into edit mode, where the grips are. */
async function editMode(page: Page) {
  const box = (await page.getByTestId('rem-body').first().boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('row-grip').first()).toBeVisible();
}

async function addRow(page: Page, section: string, text: string) {
  await page.getByTestId(`secadd-${section}`).first().click();
  await page.getByTestId('rem-add-field').fill(text);
  await page.getByTestId('rem-add-field').press('Enter');
  await expect(page.getByTestId('rem-row').filter({ hasText: text })).toBeVisible();
}

/** Which section a row is drawn under, read off the headers above it. */
async function sectionOf(page: Page, text: string): Promise<string | null> {
  return page.evaluate((t) => {
    const row = [...document.querySelectorAll('[data-testid="rem-row"]')].find((e) => (e.textContent ?? '').includes(t));
    if (!row) return null;
    let n: Element | null = row;
    while (n?.parentElement) {
      n = n.parentElement;
      const head = n.querySelector('[data-testid^="head-sec-"]');
      if (head) return (head.getAttribute('data-testid') ?? '').replace('head-sec-', '');
    }
    return null;
  }, text);
}

/** Which FOLDER a row is drawn under, read off the folder heads above it. */
async function folderOf(page: Page, text: string): Promise<string | null> {
  return page.evaluate((t) => {
    const row = [...document.querySelectorAll('[data-testid="rem-row"]')].find((e) => (e.textContent ?? '').includes(t));
    if (!row) return null;
    let n: Element | null = row;
    while (n?.parentElement) {
      n = n.parentElement;
      const head = n.querySelector('[data-testid^="head-fold-"]');
      if (head) return (head.getAttribute('data-testid') ?? '').replace('head-fold-', '');
    }
    return null;
  }, text);
}

/** Drag a row's grip by dy, the way a finger does it. */
async function dragRow(page: Page, text: string, dy: number) {
  const grip = page.getByTestId('rem-row').filter({ hasText: text }).first().getByTestId('row-grip');
  const b = (await grip.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The rows are measured asynchronously at grant; a gesture that outruns
  // that is one no hand can make.
  await page.waitForTimeout(200);
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (dy * i) / 8);
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function twoSections(page: Page) {
  await page.getByTestId('tab-reminders').click();
  await page.getByTestId('foldadd-Reminders').click();
  await page.getByPlaceholder('New section').fill('Later');
  await page.getByPlaceholder('New section').press('Enter');
  await expect(page.getByTestId('head-sec-Later')).toBeVisible();
}

test('a row dragged to the bottom of its own section stays in that section', async ({ page }) => {
  // The "between sections" fault: this boundary sits above the next header,
  // and it used to read as "before the first row below it" — so the reminder
  // left the section the hand had dropped it in.
  test.setTimeout(120_000);
  await signup(page);
  // A new section is added ABOVE the one that was there, so Later is the
  // section with another one under it — which is the case being tested.
  await twoSections(page);
  await addRow(page, 'Later', 'later two');
  await addRow(page, 'Later', 'later one');
  await addRow(page, 'General', 'gen one');
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['later one', 'later two', 'gen one']);

  const rowH = (await page.getByTestId('rem-row').first().boundingBox())!.height;
  await editMode(page);

  // 'later one' is first in Later; drop it at that section's END — past its
  // one sibling, and hard against General's header.
  await dragRow(page, 'later one', rowH * 1.2);
  await expect
    .poll(() => sectionOf(page, 'later one'), { message: 'it stayed in Later', timeout: 10_000 })
    .toBe('Later');
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['later two', 'later one', 'gen one']);
});

test('a row dropped under a shut section joins it', async ({ page }) => {
  // A closed section is a header and nothing else, so the boundary under it is
  // the end of that closed section — a landing the list could not offer at all
  // while its rows were still in the index.
  test.setTimeout(120_000);
  await signup(page);
  await twoSections(page);
  await addRow(page, 'General', 'gen one');
  await addRow(page, 'Later', 'later one');

  const rowH = (await page.getByTestId('rem-row').first().boundingBox())!.height;
  await editMode(page);
  await page.getByTestId('secfold-Later').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('rem-row')).toHaveCount(1);

  // Down onto the shut header: the end of Later.
  const head = (await page.getByTestId('head-sec-Later').boundingBox())!;
  const row = (await page.getByTestId('rem-row').first().boundingBox())!;
  await dragRow(page, 'gen one', head.y + head.height / 2 - (row.y + row.height / 2) + 4);

  await page.getByTestId('secfold-Later').click();
  await page.waitForTimeout(300);
  await expect
    .poll(() => sectionOf(page, 'gen one'), { message: 'it went into the shut section', timeout: 10_000 })
    .toBe('Later');
});

test('a shut FOLDER above does not redirect a drag below it', async ({ page }) => {
  // The index fault on its own. This screen already knew to leave out a folded
  // SECTION's rows; what it did not know was that a folded FOLDER takes every
  // section inside it off the screen too. Those rows stayed in the list, so
  // everything below the shut folder was out by that many places and the drop
  // landed on a row nobody was pointing at. (Notes had the same hole, and
  // Habits had it for sections as well.)
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // A second folder. A new one lands BELOW the one that was there, so the
  // folder that gets shut is the original — the rows hidden by it have to be
  // ABOVE the drag or their absence from the index changes nothing.
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Attic');
  await page.getByPlaceholder('New folder').press('Enter');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('head-fold-Attic')).toBeVisible();
  // …with a section of its own, named so its testIDs cannot collide with the
  // General every new folder is seeded with.
  await page.getByTestId('foldadd-Attic').click();
  await page.getByPlaceholder('New section').fill('Junk');
  await page.getByPlaceholder('New section').press('Enter');
  await expect(page.getByTestId('head-sec-Junk')).toBeVisible();

  // Three rows in the folder that will be SHUT, three below it in the other.
  for (const t of ['shut three', 'shut two', 'shut one']) await addRow(page, 'General', t);
  for (const t of ['c', 'b', 'a']) await addRow(page, 'Junk', t);
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['shut one', 'shut two', 'shut three', 'a', 'b', 'c']);

  const rowH = (await page.getByTestId('rem-row').first().boundingBox())!.height;
  await editMode(page);
  await page.getByTestId('foldfold-Reminders').click();
  await page.waitForTimeout(300);
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['a', 'b', 'c']);

  // 'a' one place down, with three hidden rows above it.
  await dragRow(page, 'a', rowH * 1.2);
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { message: 'it moved exactly one place', timeout: 10_000 })
    .toEqual(['b', 'a', 'c']);
  expect(await sectionOf(page, 'a')).toBe('Junk');
});

test('a shut FOLDER can be dropped INTO, and the row joins it', async ({ page }) => {
  // Sean, 2026-09-21: "make it possible to drag items between sections and
  // folders." Between OPEN folders already worked — the flat list spans them
  // all and `moveReminderBlock` re-files `folderId` from the destination
  // section. A SHUT one was the hole: it contributed no entry, no midpoint
  // and no boundary, so the one folder you most want to file into — the one
  // you are not reading — was the one the gesture skipped clean over.
  //
  // One head entry, keyed to the folder's FIRST section, is the whole fix,
  // and it is what a shut SECTION has always done one level down. A new
  // folder is seeded with a General of its own, so that is where the row
  // lands and no second section is needed to show it.
  test.setTimeout(120_000);
  await signup(page);
  await page.getByTestId('tab-reminders').click();
  // A new folder lands BELOW, so Attic is the one under the rows.
  await page.getByTestId('pick-reminders').click();
  await page.getByText('Manage folders…').click();
  await page.getByPlaceholder('New folder').fill('Attic');
  await page.getByPlaceholder('New folder').press('Enter');
  await page.getByText('Done', { exact: true }).click();
  await expect(page.getByTestId('head-fold-Attic')).toBeVisible();

  for (const t of ['two', 'one']) await addRow(page, 'General', t);
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['one', 'two']);
  expect(await folderOf(page, 'two')).toBe('Reminders');

  const rowH = (await page.getByTestId('rem-row').first().boundingBox())!.height;
  await editMode(page);
  await page.getByTestId('foldfold-Attic').click();
  await page.waitForTimeout(300);

  // Well past Attic's head — a drop beyond the last entry is the end of the
  // last thing drawn, which is that head.
  await dragRow(page, 'two', rowH * 5);
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { message: 'it left the folder it was in', timeout: 10_000 })
    .toEqual(['one']);

  // Open Attic again and there it is.
  await page.getByTestId('foldfold-Attic').click();
  await expect
    .poll(() => page.getByTestId('rem-body').allTextContents(), { timeout: 10_000 })
    .toEqual(['one', 'two']);
  expect(await folderOf(page, 'two')).toBe('Attic');
});
