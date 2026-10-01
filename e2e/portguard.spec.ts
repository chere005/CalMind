/**
 * Every spec reaches its harness through e2e/port.ts — and what port.ts says
 * is what the app actually does on that port.
 *
 * The deploy runs this suite as parallel shards since 2026-10-01, each slice
 * against its own `php -S` on its own port (server/deploy.sh). A spec that
 * hardcodes the first slice's port does not fail on the others, which is the
 * trouble: its API calls land on another slice's server, and a storage key
 * carrying that port is one the page never reads — corruptboot would seed a
 * key the app ignores, boot clean, and pass having tested nothing. The first
 * test keeps the literal out of the specs; the second runs in every slice and
 * proves, on THAT slice's port, that the keys port.ts derives are the ones the
 * app writes, so the derivation cannot drift from store.tsx's instanceTag()
 * without going red.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PORT, SESSION_KEY, snapshotKey } from './port';

const E2E = __dirname;

test('no spec names a harness port — they all ask e2e/port.ts', () => {
  const offenders: string[] = [];
  for (const name of readdirSync(E2E)) {
    // port.ts is the one place that may; freshness.ts and router.php serve
    // whatever port they are started on and name none.
    if (!name.endsWith('.ts') || name === 'port.ts') continue;
    const lines = readFileSync(join(E2E, name), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // A bare 87xx (the suite's harness ports), or any host:port / the
      // host_port form the instance tag turns it into.
      if (/\b87\d\d\b/.test(line) || /(127\.0\.0\.1|localhost)[:_]\d/.test(line)) {
        offenders.push(`${name}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  expect(offenders, 'take the port from e2e/port.ts (PORT, BASE, API, SESSION_KEY, snapshotKey)').toEqual([]);
});

test('the keys port.ts derives are the keys the app writes on this port', async ({ page }) => {
  // Usernames are 2-20 characters; this is 14.
  const u = `pg${PORT}${String(Date.now()).slice(-8)}`;
  await page.goto('.');
  await page.getByText('Sign up', { exact: true }).click();
  await page.getByPlaceholder('Username').fill(u);
  await page.getByPlaceholder('Email').fill(`${u}@example.com`);
  await page.getByPlaceholder('Password', { exact: true }).fill('e2epassword');
  await page.getByPlaceholder('Confirm password').fill('e2epassword');
  await page.getByText('Sign up', { exact: true }).click();
  await expect(page.getByTestId('tab-reminders')).toBeVisible({ timeout: 15_000 });

  const sessions = () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('calmind.session')));
  expect(await sessions(), `the app's session key on port ${PORT}`).toEqual([SESSION_KEY]);
  // The snapshot is written behind a debounce, so it is waited for — under
  // exactly the name corruptboot damages.
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k) !== null, snapshotKey(u)), { timeout: 10_000 })
    .toBe(true);
});
