/**
 * Usage:  node tools/sweep-tap-targets.mjs            (expects a server on 8791)
 *
 *   npm run export:web
 *   php -S 127.0.0.1:8791 -t apps/app/dist e2e/router.php &
 *   node tools/sweep-tap-targets.mjs
 *
 * Every clickable thing on the web, measured — the systematic version of the
 * checkbox fix. hitSlop is a no-op under react-native-web, so a control is
 * exactly as big as it is DRAWN there; the only way to know which ones are
 * too small is to ask the page.
 *
 * Reports the effective box: the drawn rect grown by any absolutely
 * positioned overlay inside it (that is what WebHitSlop is). 44pt is Apple's
 * guidance; 30 is the line below which a control is genuinely awkward on a
 * phone, so that is what this flags.
 */
import { chromium } from '/Users/s/GIT/CalMind/node_modules/playwright/index.mjs';

const MIN = 30;
// It has earned its keep: it found the collapse-all button shrunk to a 24pt
// target when its ICON was made smaller, and it found Reminders' collapse-all
// still drawing a static chevron long after Notes' was fixed. Neither was
// visible by reading the source.
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://127.0.0.1:8791/test/calmind/');
await p.getByText('Sign up', { exact: true }).click();
const u = 'sweep' + Date.now();
await p.getByPlaceholder('Username').fill(u);
await p.getByPlaceholder('Email').fill(u + '@example.com');
await p.getByPlaceholder('Password', { exact: true }).fill('demo-pass-1');
await p.getByPlaceholder('Confirm password').fill('demo-pass-1');
await p.getByText('Sign up', { exact: true }).click();
await p.getByTestId('tab-reminders').waitFor({ timeout: 10000 });

const measure = async (where) => {
  const small = await p.evaluate((MIN) => {
    const out = [];
    for (const el of document.querySelectorAll('[role="button"], button, [data-testid]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Grow by any absolutely positioned child that sticks out — WebHitSlop.
      let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
      for (const c of el.children) {
        const cr = c.getBoundingClientRect();
        if (getComputedStyle(c).position !== 'absolute') continue;
        top = Math.min(top, cr.top); bottom = Math.max(bottom, cr.bottom);
        left = Math.min(left, cr.left); right = Math.max(right, cr.right);
      }
      const w = Math.round(right - left), h = Math.round(bottom - top);
      if (Math.min(w, h) < MIN) {
        out.push({ id: el.getAttribute('data-testid') || (el.textContent || '').slice(0, 18).trim(), w, h });
      }
    }
    return out;
  }, MIN);
  const seen = new Set();
  const uniq = small.filter((x) => { const k = `${x.id}|${x.w}x${x.h}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (uniq.length) {
    console.log(`\n--- ${where} ---`);
    for (const s of uniq) console.log(`  ${s.w}x${s.h}  ${s.id || '(no testid)'}`);
  }
};

for (const [tab, label] of [['tab-reminders', 'Reminders'], ['tab-calendar', 'Calendar'], ['tab-notes', 'Notes'], ['tab-habits', 'Habits']]) {
  await p.getByTestId(tab).click().catch(() => {});
  await p.waitForTimeout(500);
  await measure(label);
}
// The pickers, where the checkbox bug lived.
for (const [tab, pick, label] of [['tab-notes', 'pick-notes', 'Notes picker'], ['tab-calendar', 'pick-calendar', 'Calendar picker']]) {
  await p.getByTestId(tab).click().catch(() => {});
  await p.waitForTimeout(300);
  await p.getByTestId(pick).click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(500);
  await measure(label);
  await p.keyboard.press('Escape').catch(() => {});
}
// The recipe editor — added a link button and a URL row tonight, and never
// looked at either as a tap target.
await p.getByTestId('tab-notes').click();
await p.waitForTimeout(400);
await p.getByTestId('secadd-General').first().click();
await p.waitForTimeout(800);
await p.getByTestId('note-body-edit').fill('2 cups flour\nMix it well.');
await p.getByTestId('note-title').click();
await p.waitForTimeout(300);
await p.getByTestId('recipe-import').click();
await p.waitForTimeout(900);
await measure('Recipe editor');
await p.getByTestId('recipe-link').click().catch(() => {});
await p.waitForTimeout(400);
// PROVE the row opened. Without this the second pass is identical to the
// first whether the click worked or not — a measurement that cannot fail.
const urlBox = await p.getByTestId('recipe-url').boundingBox().catch(() => null);
const goBox = await p.getByTestId('recipe-url-go').boundingBox().catch(() => null);
console.log('link row opened  :', !!urlBox);
console.log('recipe-url       :', urlBox && `${Math.round(urlBox.width)}x${Math.round(urlBox.height)}`);
console.log('recipe-url-go    :', goBox && `${Math.round(goBox.width)}x${Math.round(goBox.height)}`);
const linkBox = await p.getByTestId('recipe-link').boundingBox().catch(() => null);
console.log('recipe-link      :', linkBox && `${Math.round(linkBox.width)}x${Math.round(linkBox.height)}`);
await measure('Recipe editor + link row');

console.log('\nswept.');
await b.close();
