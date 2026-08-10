import { test, expect, type Page } from '@playwright/test';

let seq = 0;
async function signup(page: Page): Promise<string> {
  const user = `rurl${Date.now()}${seq++}`;
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

/**
 * Importing a recipe from a link, end to end: the server fetches the page
 * (fetchurl.php, SSRF-checked), core reads its schema.org JSON-LD, and the
 * editor fills in.
 *
 * The page is served by the test itself through route interception rather
 * than reached over the internet — a spec that depends on a real recipe site
 * fails the week that site redesigns, and tests nothing about CalMind when it
 * does. What is under test here is the WIRING: request made, HTML parsed,
 * fields filled, and the failure path saying so out loud.
 */
const RECIPE_HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Test Pancakes',
  description: 'A long story about my grandmother which is not a step.',
  recipeIngredient: ['2 cups flour', '1/2 cup milk', '1 tsp salt'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Mix the dry things' },
    { '@type': 'HowToStep', text: 'Add the wet things' },
  ],
  nutrition: { '@type': 'NutritionInformation', calories: '400 kcal' },
})}</script></head><body>ads and chatter</body></html>`;

test('a recipe link fills in ingredients and steps, and nothing else', async ({ page }) => {
  await signup(page);

  // The server's fetch is the part we stand in for: everything after it —
  // parsing, filling, the ONLY-ingredients-and-steps rule — is real.
  await page.route('**/api/**', async (route) => {
    const body = route.request().postDataJSON?.();
    if (body?.action === 'recipe_fetch') {
      expect(body.url).toContain('example.com');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, html: RECIPE_HTML }) });
    }
    return route.fallback();
  });

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('From a link');
  await page.getByTestId('note-body-edit').fill('placeholder body');
  await page.getByTestId('note-title').click();
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('recipe-link').click();
  await page.getByTestId('recipe-url').fill('https://example.com/pancakes');
  await page.getByTestId('recipe-url-go').click();

  await expect(page.getByText('2 cups flour')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('½ cup milk')).toBeVisible();
  await expect(page.getByText('Mix the dry things')).toBeVisible();
  await expect(page.getByText('Add the wet things')).toBeVisible();

  // Sean's rule, asserted rather than assumed: the story and the nutrition
  // block must NOT come along.
  await expect(page.getByText(/grandmother/)).toHaveCount(0);
  await expect(page.getByText(/400 kcal/)).toHaveCount(0);
});

test('a page with no recipe says so instead of appearing to work', async ({ page }) => {
  await signup(page);
  await page.route('**/api/**', async (route) => {
    const body = route.request().postDataJSON?.();
    if (body?.action === 'recipe_fetch') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, html: '<html><body>just a blog</body></html>' }) });
    }
    return route.fallback();
  });

  await page.getByTestId('tab-notes').click();
  await page.getByTestId('secadd-General').first().click();
  await page.getByTestId('note-title').fill('Not a recipe');
  await page.getByTestId('note-body-edit').fill('placeholder body');
  await page.getByTestId('note-title').click();
  await page.getByTestId('recipe-import').click();
  await expect(page.getByTestId('recipe-save')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('recipe-link').click();
  await page.getByTestId('recipe-url').fill('https://example.com/blog');
  await page.getByTestId('recipe-url-go').click();

  await expect(page.getByText('No recipe found on that page.')).toBeVisible({ timeout: 10_000 });
});
