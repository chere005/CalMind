/**
 * Building a recipe BY HAND — the half of the editor no spec touched.
 *
 * The recipe editor is well covered where it is fed from outside: importing
 * from a URL, reading a photo, mending an OCR'd line by tapping it, dragging
 * ingredients into order. Sweeping the app's 160 testIDs against the suite on
 * 2026-08-12 showed what that left:
 *
 *   ing-add, ing-field   — typing an ingredient in yourself
 *   step-add, step-field — typing a step in yourself
 *   step-del, step-grip  — removing and reordering a step
 *
 * So every path INTO a recipe was tested except the one that needs no camera
 * and no website, and steps could be added, deleted and reordered with
 * nothing watching. This is the feature Sean asked to be pushed hardest.
 *
 * The two lists deliberately disagree about where a new line lands, and that
 * is the first thing pinned here because it is exactly the sort of detail a
 * refactor flips without noticing: a new INGREDIENT goes to the top (you
 * remember one you missed, and it belongs with the others you can see), a new
 * STEP goes to the bottom (steps are a sequence and you are writing the next
 * one). Both are stated in RecipeEditor.tsx; neither was checked.
 */
import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rh${Date.now()}${seq++}`;
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

/** A note turned into a recipe, the route the other recipe specs use. */
async function openEditor(page: Page, body: string) {
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Pancakes');
  // The title touch collapsed the body to its view (deterministic since
  // the title-tap rule, 2026-08-18) — reopen it the way a hand would.
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(body);
  await page.getByTestId('recipe-import').click();
}

// The badge's family icon sits between name and measure in a row's text
// now; the claims these arrays make are about WORDS and ORDER, so the icon
// is stripped before comparing.
const deIcon = (a: string[]) => a.map((t) => t.replace(/[\u{1F944}\u{1F963}\u{2696}\u{1F4A7}\u{FE0F}]/gu, ''));
const ings = (page: Page) => page.getByTestId('ing-row').allTextContents().then(deIcon);
const stepTexts = (page: Page) => page.getByTestId('step-row').allTextContents();
/** The numbers, which are drawn on the GRIP rather than in the row — that is
 *  what makes the grip a handle you already look at. */
const stepNums = (page: Page) => page.getByTestId('step-grip').allTextContents();

/** Swipe a row left to park its delete, the way app.spec.ts does for
 *  ingredients. The control does not exist until the swipe — clicking for it
 *  first just waits out the whole budget, which is how this test first
 *  "failed". */
async function swipeToDelete(page: Page, row: ReturnType<Page['getByTestId']>) {
  // The recipe page slides in; measuring a row mid-animation aims the swipe
  // at where it USED to be, and the parked delete never appears.
  await page.waitForTimeout(400);
  const box = (await row.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width - 20 - i * 15, y);
  await page.mouse.up();
}

test('an ingredient typed by hand lands at the TOP', async ({ page }) => {
  await signup(page);
  await openEditor(page, '2 cups flour\n1. Mix it');

  await page.getByTestId('ing-field').fill('1 cup milk');
  await page.getByTestId('ing-field').press('Enter');
  await expect.poll(() => ings(page), { message: 'a new ingredient joins above the ones already there' })
    .toEqual(['milk1 cup', 'flour2 cups']);

  // The + button is the other way in and must agree with Enter.
  await page.getByTestId('ing-field').fill('3 eggs');
  await page.getByTestId('ing-add').click();
  await expect.poll(() => ings(page)).toEqual(['eggs3', 'milk1 cup', 'flour2 cups']);

  // The field clears itself, or the next line arrives with this one's text
  // still in front of it.
  await expect(page.getByTestId('ing-field')).toHaveValue('');
});

test('a step typed by hand lands at the BOTTOM, the opposite way', async ({ page }) => {
  await signup(page);
  await openEditor(page, '2 cups flour\n1. Mix it');

  await page.getByTestId('step-field').fill('Fry until golden');
  await page.getByTestId('step-field').press('Enter');
  await expect.poll(() => stepTexts(page), { message: 'a new step follows the ones already there' })
    .toEqual(['Mix it', 'Fry until golden']);

  await page.getByTestId('step-field').fill('Serve');
  await page.getByTestId('step-add').click();
  await expect.poll(() => stepTexts(page)).toEqual(['Mix it', 'Fry until golden', 'Serve']);
  await expect(page.getByTestId('step-field')).toHaveValue('');
});

test('a blank line adds nothing, on either list', async ({ page }) => {
  await signup(page);
  await openEditor(page, '2 cups flour\n1. Mix it');

  await page.getByTestId('ing-field').fill('   ');
  await page.getByTestId('ing-add').click();
  await page.getByTestId('step-field').fill('   ');
  await page.getByTestId('step-add').click();

  // Still one of each: whitespace is not a line, and an empty add is how the
  // editor's own delete works, so this must not leave a ghost row behind.
  await expect.poll(() => ings(page)).toEqual(['flour2 cups']);
  await expect.poll(() => stepTexts(page)).toEqual(['Mix it']);
});

test('a step deletes, and the numbers close up behind it', async ({ page }) => {
  await signup(page);
  await openEditor(page, '2 cups flour\n1. Mix it\n2. Rest it\n3. Fry it');
  await expect.poll(() => stepTexts(page)).toEqual(['Mix it', 'Rest it', 'Fry it']);

  // The middle one, so a wrong index shows: deleting the first or last would
  // leave a plausible-looking list either way.
  await expect.poll(() => stepNums(page)).toEqual(['1.', '2.', '3.']);
  // Nothing parked to begin with, or the click below could land on a stale one.
  await expect(page.getByTestId('step-del')).toHaveCount(0);
  await swipeToDelete(page, page.getByTestId('step-row').nth(1));
  // The swipe counts as the first press, so one tap finishes it.
  await page.getByTestId('step-del').click({ timeout: 5_000 });
  await expect.poll(() => stepTexts(page), { message: 'the middle step is the one that goes' })
    .toEqual(['Mix it', 'Fry it']);
  // The numbers are positional, so the survivors must close up rather than
  // leave a 3 behind — checked on the grip, where they are drawn.
  await expect.poll(() => stepNums(page), { message: 'the numbers close up' }).toEqual(['1.', '2.']);
});

test('what was typed by hand survives closing the editor', async ({ page }) => {
  await signup(page);
  await openEditor(page, '2 cups flour\n1. Mix it');

  await page.getByTestId('ing-field').fill('1 cup milk');
  await page.getByTestId('ing-field').press('Enter');
  await page.getByTestId('step-field').fill('Fry until golden');
  await page.getByTestId('step-field').press('Enter');
  await page.getByTestId('recipe-save').click();

  // Back through the editor: the note is what persists, so reopening it is
  // the only thing that proves the typing reached the note rather than a
  // component's own state.
  await page.getByTestId('recipe-import').click();
  await expect.poll(() => ings(page)).toEqual(['milk1 cup', 'flour2 cups']);
  await expect.poll(() => stepTexts(page)).toEqual(['Mix it', 'Fry until golden']);
});
