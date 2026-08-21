import { expect, test, type Page } from '@playwright/test';

/**
 * Two instances on ONE origin do not share a session.
 *
 * seancheren.com/calmind, /test/calmind and /dev/calmind differ only by path,
 * and localStorage is per-ORIGIN. A single `calmind.session` key meant loading
 * prod restored the session test had written — and because a Session carries
 * its own serverUrl, the prod page then talked to TEST while looking like
 * prod. Sean, 2026-08-20: "my account seems there at seancheren.com/calmind
 * even on web."
 *
 * The harness serves the app at /calmind and the router answers any path
 * under it, so a second instance is imitated by loading the same app from a
 * DIFFERENT path — which is exactly the shape of the bug: same origin,
 * different base. What is asserted is the storage: one key per instance, and
 * a session written by one not readable as the other's.
 */
async function signup(page: Page): Promise<string> {
  const user = `is${String(Date.now()).slice(-8)}`;
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

const keys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('calmind.')));

test('the session key names the instance it belongs to', async ({ page }) => {
  test.setTimeout(120_000);
  const user = await signup(page);

  const ks = await keys(page);
  const session = ks.filter((k) => k.startsWith('calmind.session'));
  expect(session.length, 'exactly one session key').toBe(1);
  // The point of the fix: NOT the bare name that every instance would read.
  expect(session[0], 'the session key carries an instance tag').not.toBe('calmind.session');
  expect(session[0]).toContain('@');
  expect(session[0], 'and the tag is the API this instance uses').toContain('_calmind');

  const snap = ks.filter((k) => k.startsWith(`calmind.snapshot.${user}`));
  expect(snap.length, 'the snapshot is namespaced too').toBe(1);
  expect(snap[0]).toContain('@');
});

test('a session written for one instance is not read by another on the same origin', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  const mine = (await keys(page)).find((k) => k.startsWith('calmind.session'))!;

  // Re-tag it as some OTHER instance's — the exact situation prod was in,
  // holding a key that belonged to test.
  await page.evaluate((k) => {
    const raw = localStorage.getItem(k)!;
    localStorage.removeItem(k);
    localStorage.setItem('calmind.session@seancheren.com_calmind', raw);
  }, mine);

  await page.reload();
  // Signed OUT: the other instance's session is not this one's to use.
  await expect(page.getByText('Sign up', { exact: true }), 'the foreign session was ignored')
    .toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('tab-reminders')).toHaveCount(0);
  // …and it was left where it was, rather than consumed.
  const foreignIntact = await page.evaluate(() =>
    localStorage.getItem('calmind.session@seancheren.com_calmind') !== null);
  expect(foreignIntact, "the other instance's key is untouched").toBe(true);
});

test('a legacy un-namespaced session is adopted only by the instance it names', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  const mine = (await keys(page)).find((k) => k.startsWith('calmind.session'))!;

  // Put it back the way it was before instance tags existed, keeping its own
  // serverUrl — this is every existing install on the morning of the upgrade.
  const raw = await page.evaluate((k) => {
    const v = localStorage.getItem(k)!;
    localStorage.removeItem(k);
    localStorage.setItem('calmind.session', v);
    return v;
  }, mine);
  expect(JSON.parse(raw).serverUrl, 'the legacy session names this instance').toContain('/calmind/');

  await page.reload();
  // Adopted: the browser that has been on test all along keeps its session.
  await expect(page.getByTestId('tab-reminders'), 'still signed in').toBeVisible({ timeout: 20_000 });
  expect(await keys(page), 'and it now has a tagged key').toContain(mine);

  // …and the legacy key is LEFT where it was, not deleted: another instance
  // may still be entitled to claim it, and this migration must not destroy
  // something it merely declined to use.
  const legacyStill = await page.evaluate(() => localStorage.getItem('calmind.session') !== null);
  expect(legacyStill, 'the legacy key survives the adoption').toBe(true);
});

test('a legacy session naming a DIFFERENT instance is left alone', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  const mine = (await keys(page)).find((k) => k.startsWith('calmind.session'))!;

  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)!);
    localStorage.removeItem(k);
    // A session for PROD, sitting in the shared key, exactly as test's was
    // sitting where prod could read it.
    s.serverUrl = 'https://seancheren.com/calmind/api/index.php';
    localStorage.setItem('calmind.session', JSON.stringify(s));
  }, mine);

  // WHAT IT TALKS TO is the only honest signal, and it took two wrong
  // assertions to get here. The screen proves nothing: a foreign session that
  // IS adopted fails its first sync with a 401 and signs out, so the login
  // page appears either way. Nor does the storage: that sign-out DELETES the
  // key it adopted, so it is gone before a test can look. Both versions
  // stayed green with the ownership check deleted.
  //
  // A request to the other instance's API cannot be faked or cleaned up.
  const foreign: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://seancheren.com/calmind/api')) foreign.push(r.url());
  });
  // Blocked rather than sent: this spec must not reach the real prod server.
  await page.route('https://seancheren.com/calmind/api/**', (route) => route.abort());

  await page.reload();
  await expect(page.getByText('Sign up', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  expect(foreign, 'it never spoke to the instance the session named').toEqual([]);
});
