import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The photo path, end to end and under the REAL engine: a recipe card is
 * rasterised, handed to the picker, read by tesseract, and what comes out the
 * other side has to be a structured recipe.
 *
 * The card is a tracked fixture rendered here rather than a PNG someone once
 * left in /tmp — which is what this spec used to load. That file was on one
 * machine and nowhere else, so the only test guarding the photo import would
 * have failed on a fresh checkout, and failed for a reason ("file not found")
 * that says nothing about the feature.
 */
// Playwright runs from the repo root (see playwright.config.ts).
const CARD = resolve(process.cwd(), 'e2e/fixtures/recipe-card.svg');
const AWKWARD = resolve(process.cwd(), 'e2e/fixtures/recipe-card-awkward.svg');

test('the recipe importer reads photos into a formatted note', async ({ page, context }) => {
  test.setTimeout(120_000); // tesseract fetches its engine on first run

  // Rasterise the fixture with the browser already running.
  const shot = join(tmpdir(), `calmind-recipe-card-${Date.now()}.png`);
  const painter = await context.newPage();
  await painter.setContent(`<body style="margin:0">${readFileSync(CARD, 'utf8')}</body>`);
  await painter.locator('svg').screenshot({ path: shot });
  await painter.close();

  const u = 'ocr' + String(Date.now()).slice(-8);
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(u);
  await page.getByPlaceholder('Email').fill(u + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('x');
  await page.getByPlaceholder('New note').press('Enter');
  // Clear the title so the importer may claim it, then open the Recipe page
  // — photos are picked from ITS camera button now, not the note editor.
  await page.getByPlaceholder('Title').fill('');
  await page.getByTestId('recipe-import').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('recipe-photos').click();
  await (await chooser).setFiles(shot);
  await expect(page.getByTestId('recipe-title')).toHaveValue(/Midnight Pancakes/i, { timeout: 100_000 });

  // What the engine actually made of it, before anything is saved. These are
  // this run's parsing rules proven against a REAL read rather than against
  // recipe text I typed myself:
  const ings = (await page.getByTestId('ing-row').allTextContents()).join(' | ').toLowerCase();
  const steps = (await page.getByTestId('step-row').allTextContents()).join(' | ').toLowerCase();
  // The measure lives in the row's badge now, name first: 'flour2 cups'.
  expect(ings, 'the quantities came through').toContain('flour2 cups');
  // An ingredient with no number in front of it still counts as one — it used
  // to fall through to the leftovers under "Include notes".
  expect(ings, 'a wordy ingredient counts').toContain('a pinch of salt');
  // …and the fraction is normalised on the way in.
  expect(ings, 'the fraction reads typographically').toContain('½ cup whole milk');
  // The line under the title is prose and is NOT swept into the list, which is
  // the other half of that rule: nothing has established a quantity run yet.
  expect(ings, 'the subtitle stayed out').not.toContain('serves four');
  expect(steps).toContain('whisk everything together');
  expect(steps).toContain('fry in butter until golden');

  await page.getByTestId('recipe-save').click();
  // Saved back into the note: title claimed, marker body rendered.
  await expect(page.getByPlaceholder('Title')).toHaveValue(/Midnight Pancakes/i);
  const body = await page.getByTestId('note-body-view').innerText();
  expect(body.toLowerCase()).toContain('flour');
  expect(body).toContain('•'); // the ingredient bullets rendered
  expect(body.toLowerCase()).toContain('whisk');
});

test('an awkward card: no title, a wordy last ingredient, a method with no heading', async ({ page, context }) => {
  test.setTimeout(180_000);

  // The tidy card next door cannot exercise this run's parse fixes, because it
  // leads with a name and labels its method. This one is shaped like the notes
  // that actually broke: the title scan used to walk past "Ingredients", over
  // the quantities, and take "fresh cracked black pepper to taste" as the
  // recipe's name — and nothing closed the ingredient block, so the cooking
  // instructions were bulleted as food.
  const shot = join(tmpdir(), `calmind-awkward-${Date.now()}.png`);
  const painter = await context.newPage();
  await painter.setContent(`<body style="margin:0">${readFileSync(AWKWARD, 'utf8')}</body>`);
  await painter.locator('svg').screenshot({ path: shot });
  await painter.close();

  const u = 'awk' + String(Date.now()).slice(-8);
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(u);
  await page.getByPlaceholder('Email').fill(u + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('x');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByPlaceholder('Title').fill('');
  await page.getByTestId('recipe-import').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('recipe-photos').click();
  await (await chooser).setFiles(shot);

  await expect
    .poll(async () => (await page.getByTestId('ing-row').allTextContents()).length, { timeout: 120_000 })
    .toBeGreaterThan(2);
  const ings = (await page.getByTestId('ing-row').allTextContents()).join(' | ').toLowerCase();

  expect(ings, 'the numberless last ingredient stays an ingredient').toContain('black pepper');
  expect(ings, 'and the method is not food').not.toContain('whisk everything');
  expect(ings).not.toContain('fry in butter');
  // Nothing from inside the list was promoted to the recipe's name.
  await expect(page.getByTestId('recipe-title')).not.toHaveValue(/pepper/i);

  // And the method the parser refused to guess into steps is KEPT, under
  // Include notes, rather than parsed and dropped. `extra` used to be
  // read-only state seeded when the editor opened, so anything a photo
  // brought with it went straight on the floor.
  await expect(
    page.getByText(/whisk everything together/i),
    'the unheaded method is kept as a note rather than discarded',
  ).toBeVisible();
});

test('a photo it cannot read says so, instead of ending in silence', async ({ page, context }) => {
  test.setTimeout(180_000);

  // A blank card. The engine runs, finds nothing, and the import used to end
  // with the spinner clearing and no change on screen — indistinguishable
  // from a slow read, or from a tap that missed.
  const shot = join(tmpdir(), `calmind-blank-${Date.now()}.png`);
  const painter = await context.newPage();
  await painter.setContent('<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="white"/></svg></body>');
  await painter.locator('svg').screenshot({ path: shot });
  await painter.close();

  const u = 'blank' + String(Date.now()).slice(-7);
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(u);
  await page.getByPlaceholder('Email').fill(u + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('x');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('recipe-import').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('recipe-photos').click();
  await (await chooser).setFiles(shot);

  await expect(page.getByText(/No text found in that photo/), 'it says so').toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('ing-row'), 'and nothing was invented to fill the gap').toHaveCount(0);
});
