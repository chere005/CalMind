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

/**
 * The dead-band report: a press box materially shorter than the row it sits in.
 *
 * The 30pt rule above is about controls that are SMALL. This is a different
 * bug and the 30pt rule cannot see it: a note row is 44pt tall and looks
 * tappable all over, but the Pressable inside it is a flex child with no
 * height of its own, so it collapses to its one line of text and sits centred
 * while the 26pt around it — which IS the row — does nothing. It measured
 * 240x18 and passed the width test comfortably.
 *
 * Found in Notes, Reminders AND Calendar on 2026-08-11, each written
 * separately, which is why this is a detector rather than three fixes.
 *
 * It REPORTS rather than flags, because the DOM cannot tell it which divs are
 * Pressables: react-native-web only sets role="button" when accessibilityRole
 * is given, and a row body does not give one. So a heading inside a padded
 * container looks identical to a dead band from here. The output needs a
 * person; it just has to be short enough to read.
 */
const deadBands = async (where) => {
  const rows = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-testid]')) {
      const r = el.getBoundingClientRect();
      const par = el.parentElement && el.parentElement.getBoundingClientRect();
      if (!par || r.height === 0 || r.width < 60) continue;
      // Only where the parent is a flex ROW that centres its children: that
      // is the shape that produces this: a child with no cross-axis size.
      const ps = getComputedStyle(el.parentElement);
      if (ps.display !== 'flex' || ps.flexDirection !== 'row') continue;
      if (ps.alignItems !== 'center') continue;
      const gap = Math.round(par.height - r.height);
      if (gap >= 8) {
        out.push({ id: el.getAttribute('data-testid'), h: Math.round(r.height), parH: Math.round(par.height), gap });
      }
    }
    return out;
  });
  const seen = new Set();
  const uniq = rows.filter((x) => { const k = `${x.id}|${x.gap}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (uniq.length) {
    console.log(`\n  ~~ dead bands · ${where} ~~`);
    for (const r of uniq) console.log(`     ${String(r.h).padStart(3)}pt in ${String(r.parH).padStart(3)}pt row  (${r.gap} dead)  ${r.id}`);
  }
};

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
  await deadBands(label);
}
// The pickers, where the checkbox bug lived.
for (const [tab, pick, label] of [['tab-notes', 'pick-notes', 'Notes picker'], ['tab-calendar', 'pick-calendar', 'Calendar picker']]) {
  await p.getByTestId(tab).click().catch(() => {});
  await p.waitForTimeout(300);
  await p.getByTestId(pick).click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(500);
  await measure(label);
  await deadBands(label);
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

// ---------------------------------------------------------------------------
// EDIT MODE, and the Name+Frequency screen.
//
// Everything above is what the screens draw AT REST, which is why none of the
// controls added on 2026-08-11 appear in it: the habit pencil, the note row's
// duplicate and delete, both grips and the frequency chips only exist once you
// have held a row. They were the newest controls in the app and the only ones
// this tool could not see.
//
// Each pass prints whether it actually got in. Without that, a hold that
// missed measures the resting screen a second time and reports it as clean —
// a sweep that cannot fail, which is the failure this repo keeps meeting.
// ---------------------------------------------------------------------------
// From a KNOWN state. Chained straight on from the recipe editor these four
// passes all reported false: the editor was still up and every tab click was
// landing on it, silently, because they are all .catch(()=>{}). A reload puts
// the app back at its default tab with the session restored.
await p.reload();
await p.getByTestId('tab-reminders').waitFor({ timeout: 15000 });

const hold = async (loc) => {
  const box = await loc.boundingBox().catch(() => null);
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(700);
  await p.mouse.up();
  await p.waitForTimeout(500);
  return true;
};

await p.getByTestId('tab-notes').click().catch(() => {});
await p.waitForTimeout(500);
await hold(p.getByTestId('note-row').first());
// The grips are drawn all along and only revealed, so their presence proves
// nothing. note-dup is rendered ONLY in edit mode.
const notesIn = await p.getByTestId('note-dup').first().isVisible().catch(() => false);
console.log('\nnotes edit mode  :', notesIn);
if (notesIn) { await measure('Notes — edit mode'); await deadBands('Notes — edit mode'); }

await p.getByTestId('tab-habits').click().catch(() => {});
await p.waitForTimeout(400);
await p.locator('[data-testid^="habit-add-"]').first().click({ timeout: 2000 }).catch(() => {});
await p.waitForTimeout(500);
const freqIn = await p.getByTestId('habit-freq-always').isVisible().catch(() => false);
console.log('habit add screen :', freqIn);
if (freqIn) {
  await measure('Habits — Name + Frequency');
  await deadBands('Habits — Name + Frequency');
  await p.getByTestId('habit-name-field').fill('Swim');
  await p.getByTestId('habit-save').click();
  await p.waitForTimeout(600);
}
await hold(p.getByTestId('habit-name').first());
const habitsIn = await p.getByTestId('habit-edit').first().isVisible().catch(() => false);
console.log('habits edit mode :', habitsIn);
if (habitsIn) { await measure('Habits — edit mode'); await deadBands('Habits — edit mode'); }

await p.getByTestId('tab-reminders').click().catch(() => {});
await p.waitForTimeout(400);
// A fresh account has no reminders, so there was no row to hold and this
// pass reported false — the resting screen measured twice would have looked
// identical to a clean bill of health.
await p.getByTestId('secadd-General').first().click({ timeout: 2000 }).catch(() => {});
await p.getByTestId('rem-add-field').fill('sweep row').catch(() => {});
await p.getByTestId('rem-add-field').press('Enter').catch(() => {});
await p.waitForTimeout(600);
await hold(p.getByTestId('rem-body').first());
const remIn = await p.getByTestId('rem-pencil').first().isVisible().catch(() => false);
console.log('reminders edit   :', remIn);
if (remIn) { await measure('Reminders — edit mode'); await deadBands('Reminders — edit mode'); }

// ---------------------------------------------------------------------------
// The surfaces this tool had never opened at all: the add window, Settings,
// and the sharing sheet. Every measurement above is a LIST screen, and these
// three are where most of the app's buttons actually live.
// ---------------------------------------------------------------------------
// The Add page carries NO testIDs — not one, checked 2026-08-11 — so there is
// nothing here to probe with and nothing for a spec to pin either. What it
// does have is Pills, and those set accessibilityRole, so measure() sees them
// through the role selector and names them by their text. Its three kind cards
// and its Done are plain Pressables and stay invisible to this tool; measured
// by hand off their styles they are ~86pt and ~50pt, which is why closing that
// gap is not urgent. Anything added to this page that must be tapped needs a
// testID or it cannot be swept.
await p.getByTestId('tab-add').click({ timeout: 2000 }).catch(() => {});
await p.waitForTimeout(800);
const addIn = await p.getByText('+ Repeat', { exact: true }).isVisible().catch(() => false);
console.log('add page         :', addIn);
if (addIn) { await measure('Add page'); await deadBands('Add page'); }
// STAY on Add for the two below. Settings and the sharing sheet open OVER the
// current screen and the one underneath stays in the DOM, so opening them from
// a list re-measures that whole list and buries anything they contribute. Add
// carries almost nothing, which makes their readings theirs.

await p.getByText(u, { exact: true }).click({ timeout: 2000 }).catch(() => {});
await p.waitForTimeout(300);
await p.getByText('Settings', { exact: true }).click({ timeout: 2000 }).catch(() => {});
await p.waitForTimeout(700);
const setIn = await p.getByTestId('open-share').isVisible().catch(() => false);
console.log('settings         :', setIn);
if (setIn) {
  await measure('Settings');
  await deadBands('Settings');
  await p.getByTestId('open-share').click();
  await p.waitForTimeout(700);
  const shareIn = await p.getByTestId('share-add-partner').isVisible().catch(() => false);
  console.log('sharing sheet    :', shareIn);
  if (shareIn) { await measure('Sharing'); await deadBands('Sharing'); }
}

console.log('\nswept.');
await b.close();
