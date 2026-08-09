import { expect, test, type Page } from '@playwright/test';

/**
 * The Recipe button pressed on a note that is not a recipe.
 *
 * It sits in the note editor's toolbar next to B / I / U, so it is one
 * mis-tap away at all times. The page parses whatever it finds, and Save
 * writes the parse back over the note — so on an ordinary note, the question
 * is whether the words come back unharmed or quietly rearranged.
 */
const PROSE = [
  'Called the letting agent about the boiler.',
  '',
  'They said someone can come Thursday between 9 and 1, which is no use, so',
  'I asked for Saturday instead and they are checking.',
  '',
  'Reference 4471-B.',
].join('\n');

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `plain${Date.now()}${seq++}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(user);
  await page.getByPlaceholder('Email').fill(user + '@example.com');
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 10_000 });
  return user;
}

test('a plain note keeps its FIRST line through the Recipe page', async ({ page }) => {
  // The parse reads an early short line as a title and consumes it. A note
  // that already has a title has no use for that, so without putting the line
  // back, Save wrote the note out with its opening line deleted — off one
  // mis-tap on a button that sits beside B/I/U.
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('Shopping');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill('Shopping list\nmilk\neggs\nbread');
  await page.getByText('← All notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'Shopping' }).click();

  await page.getByTestId('recipe-import').click();
  await page.getByTestId('recipe-save').click();
  const body = await page.getByTestId('note-body-view').innerText();
  expect(body, 'the opening line is still there').toContain('Shopping list');
  for (const item of ['milk', 'eggs', 'bread']) expect(body).toContain(item);
});

test('the Recipe page on an ordinary note gives the words back unharmed', async ({ page }) => {
  await signup(page);
  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByPlaceholder('New note').fill('Boiler');
  await page.getByPlaceholder('New note').press('Enter');
  await page.getByTestId('note-body-view').click();
  await page.getByTestId('note-body-edit').fill(PROSE);
  await page.getByText('← All notes').click();
  await page.getByTestId('note-row').filter({ hasText: 'Boiler' }).click();

  // In and straight out again through Save — the mis-tap, then the reflex.
  await page.getByTestId('recipe-import').click();
  await page.getByTestId('recipe-save').click();

  // Every line of it still there, in order, and nothing invented.
  const body = await page.getByTestId('note-body-view').innerText();
  for (const line of PROSE.split('\n').filter(Boolean)) {
    expect(body, `kept: ${line}`).toContain(line);
  }
  expect(body, 'no ingredients heading appeared').not.toContain('**Ingredients**');
  expect(body, 'no directions heading appeared').not.toContain('**Directions**');
  const first = body.indexOf('Called the letting agent');
  const last = body.indexOf('Reference 4471-B');
  expect(first, 'the note still reads top to bottom').toBeLessThan(last);
});
