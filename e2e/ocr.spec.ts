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
  expect(ings, 'the quantities came through').toContain('2 cups flour');
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
