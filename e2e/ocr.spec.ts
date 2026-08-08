import { expect, test } from '@playwright/test';

test('the recipe importer reads photos into a formatted note', async ({ page }) => {
  test.setTimeout(120_000); // tesseract fetches its engine on first run
  await page.goto('.');
  const u = 'ocr' + String(Date.now()).slice(-8);
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
  // Clear the title so the importer may claim it.
  await page.getByPlaceholder('Title').fill('');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('recipe-import').click();
  await (await chooser).setFiles('/tmp/recipe-card.svg.png');
  await expect(page.getByPlaceholder('Title')).toHaveValue(/Midnight Pancakes/i, { timeout: 100_000 });
  await page.getByPlaceholder('Title').click(); // blur any state
  const body = await page.getByTestId('note-body-view').innerText();
  expect(body.toLowerCase()).toContain('flour');
  expect(body).toContain('•'); // the ingredient bullets rendered
  expect(body.toLowerCase()).toContain('whisk');
});
