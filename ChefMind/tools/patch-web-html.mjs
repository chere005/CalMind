/**
 * The head Expo's web export doesn't give us.
 *
 * `expo export -p web` writes a fixed index.html and offers no documented
 * hook for extra <head> tags on a non-Expo-Router app (checked against the
 * v57 docs), so the export is patched here — idempotently, so running it
 * twice is a no-op and a future Expo that emits these itself won't double up.
 *
 * Why each one, because they only make sense together:
 *
 *  · viewport-fit=cover — WITHOUT this, env(safe-area-inset-*) is 0 on iOS,
 *    which means react-native-safe-area-context reports no inset, the app
 *    never pads for the notch, and iOS draws its OWN opaque status bar over
 *    the top. That bar is light by default: the white strip above a dark app.
 *  · apple-mobile-web-app-status-bar-style=black-translucent — makes that bar
 *    transparent, so the page's own background shows through the inset. The
 *    app's SafeAreaView already paints the inset with the theme's bg, so the
 *    strip follows the theme rather than any colour hardcoded here.
 *    (Caveat worth knowing: iOS draws the status bar TEXT white under
 *    black-translucent, which reads poorly on the cream Sage theme. iOS gives
 *    no "match my background, pick your own text colour" option.)
 *  · apple-mobile-web-app-capable / mobile-web-app-capable — standalone, so
 *    the home-screen launch has no browser chrome.
 *  · theme-color — the launch value only; theme.ts rewrites it on every theme
 *    switch, exactly as the suite's theme_bg() does.
 *
 * iOS caches an installed web app's head aggressively: an existing home-screen
 * icon keeps the old status-bar style until it is REMOVED and re-added.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { sourceHashes } from './source-digest.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] ?? 'app/dist/index.html';
let html = readFileSync(file, 'utf8');
const before = html;

// The viewport gains viewport-fit=cover, without disturbing what's there.
html = html.replace(/(<meta\s+name="viewport"\s+content=")([^"]*)(")/i, (m, a, content, z) =>
  /viewport-fit/.test(content) ? m : `${a}${content}, viewport-fit=cover${z}`,
);

const metas = [
  ['apple-mobile-web-app-capable', 'yes'],
  ['mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
  ['theme-color', '#111111'],
];
const add = metas
  .filter(([name]) => !new RegExp(`<meta[^>]+name=["']${name}["']`, 'i').test(html))
  .map(([name, content]) => `<meta name="${name}" content="${content}"/>`)
  .join('');
if (add) html = html.replace('</head>', `${add}</head>`);

/**
 * An uncaught error you can SEE, on a device with no console.
 *
 * A blank dark screen is what a failed render looks like from outside, and
 * that is exactly what an installed home-screen web app gave when the
 * auto-updater was wired in — while every browser and both test engines
 * rendered it perfectly. There is no console on a webclip and no way to
 * attach one from here, so the page has to say what went wrong itself.
 *
 * Inline and FIRST, so it is listening before the bundle runs and survives
 * whatever the bundle does. It draws nothing at all unless something throws,
 * so it costs an ordinary launch a few hundred bytes and nothing else.
 *
 * Listening in the CAPTURE phase, and naming a failed resource separately.
 * A <script> that 404s does not bubble an error to window and carries no
 * message, so the bubble-phase version of this would have watched a blank
 * screen in silence — which is precisely the case worth catching, since a
 * cached page pointing at a bundle that is no longer there looks exactly
 * like a blank screen and nothing else.
 *
 * It stands down the moment the app has RENDERED. The first version stayed
 * armed forever, and iOS fires a scrubbed "Script error. :0" at the page
 * when the share sheet opens over it — so sharing the app's own URL painted
 * "CalMind could not start" over an app that was running fine (seen twice,
 * simulator webclip and Safari, 2026-08-19). A late uncaught error in a
 * rendered app is the app's problem to surface; this screen is only for the
 * boot that never drew anything, which is the one case with no other voice.
 *
 * AND IT RETRACTS. The desktop shell fires one fully scrubbed error on
 * every boot — no message, no file, no line, "error undefined:undefined"
 * on the screen — and whether it lands before or after the first paint is
 * a race the SIZE OF THE ACCOUNT decides: a fresh profile rendered first
 * and the guard held; Sean's real snapshot boots slower, the error won,
 * the screen painted, and the app then finished booting UNDERNEATH it
 * (2026-08-19, his report; both halves reproduced with a diagnostic build
 * writing to localStorage). So after painting, the shout watches root: a
 * render arriving afterwards falsifies "could not start", and the screen
 * takes itself down. A boot that truly never draws keeps it forever, which
 * is the case it exists for.
 */
const ERR_ID = 'chefmind-error-shout';
if (!html.includes(ERR_ID)) {
  const shout = `<script id="${ERR_ID}">(function(){var shown=0;function say(what){if(shown++)return;var r=document.getElementById('root');if(r&&r.firstChild)return;try{var d=document.createElement('pre');d.setAttribute('data-testid','fatal-error');d.style.cssText='position:fixed;inset:0;z-index:2147483647;margin:0;padding:16px;background:#111;color:#f6b4b2;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;overflow:auto';d.textContent='ChefMind could not start.\\n\\n'+what;(document.body||document.documentElement).appendChild(d);var t=setInterval(function(){var r2=document.getElementById('root');if(r2&&r2.firstChild){clearInterval(t);if(d.parentNode)d.parentNode.removeChild(d);}},250);}catch(_){}}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t!==window&&(t.src||t.href)){say('failed to load: '+(t.src||t.href));return;}say((e&&e.message||'error')+'\\n'+((e&&e.error&&e.error.stack)||(e&&e.filename+':'+e.lineno)||''));},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;say('unhandled rejection: '+((r&&r.message)||r)+'\\n'+((r&&r.stack)||''));});})();</script>`;
  html = html.replace('<head>', `<head>${shout}`);
}

/**
 * The web app manifest the suite has always had and the export never wrote.
 * It is what makes the app installable on Android and on desktop Chrome and
 * Edge, and it carries the name and icons a home screen shows.
 *
 * Every URL in it is RELATIVE, so it resolves against wherever the manifest
 * itself is served from — /test/calmind/ today, somewhere else tomorrow —
 * rather than baking an instance prefix into a file that ships everywhere.
 * The icons are emitted by the deploy (sips), beside the apple-touch-icon.
 */
const manifest = {
  id: './',
  name: 'ChefMind',
  short_name: 'ChefMind',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#111111',
  theme_color: '#111111',
  icons: [
    { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
// The page's own background. Anything the app's views do not paint falls
// through to this, and unset means WHITE: with viewport-fit=cover the page
// now reaches into both safe areas, so an uncovered home-indicator strip
// showed as a white band under the tab bar. This is the first-paint value —
// theme.ts repaints it on every theme switch, so it follows Sage too.
if (!/id="chefmind-bg"/.test(html)) {
  html = html.replace(
    '</head>',
    '<style id="chefmind-bg">html,body{background-color:#111111}</style></head>',
  );
}

/**
 * Pin the app to the REAL bottom of the viewport, in a tab and standalone.
 *
 * expo-reset sizes the app with `height: 100%`, which resolves against the
 * initial containing block — and with viewport-fit=cover that block is the
 * LARGE viewport, the size the page would be if Safari's toolbars were gone.
 * In a browser tab with the toolbar showing, the app is therefore laid out
 * taller than the part you can see, so the tab bar (the last child of the
 * root column) lands below the fold and the space above it reads as a gap.
 * Worse, the toolbar collapses as you scroll, so the mismatch CHANGES: a
 * screen whose content overflows ends up with a different gap from a short
 * one. That is the shape of the report — a gap that differs per screen —
 * and it is why this is fixed by construction rather than by measuring.
 *
 * `dvh` is the unit for exactly this: it tracks the viewport as the toolbars
 * come and go. The native app never loads this file at all. Guarded by
 * @supports so a browser without dvh keeps the old behaviour rather than
 * losing its height entirely.
 *
 * STANDALONE IS THE OPPOSITE CASE, and the first version of this got it
 * wrong by assuming "no toolbar, so dvh == lvh == svh and nothing moves".
 * Measured on the iOS 26 simulator, webclip, 874pt screen: dvh answers 812
 * or 820 depending on the launch, svh 812, and only lvh the true 874 —
 * WebKit sizes the small viewport as if Safari's chrome existed in an app
 * that has none, and the app laid out to it sat ~62pt short, the tab bar
 * floating above a dead band. That is Sean's reported bottom gap, finally
 * reproduced. In standalone the LARGE viewport is the screen, so
 * `display-mode: standalone` (verified matching in a webclip) pins the app
 * to lvh there.
 *
 * Deliberately NOT touching padding: the bottom safe-area inset is applied
 * once, by the app's own SafeAreaView, and adding any here would double it.
 */
if (!/id="chefmind-vh"/.test(html)) {
  html = html.replace(
    '</head>',
    '<style id="chefmind-vh">@supports (height:100dvh){html,body{height:100dvh}#root{height:100dvh}}' +
      '@supports (height:100lvh){@media (display-mode: standalone){html,body{height:100lvh}#root{height:100lvh}}}</style></head>',
  );
}

/**
 * THE PAGE'S OWN RUBBER-BAND IS LEFT ALONE, deliberately, and this is here so
 * nobody adds it again.
 *
 * Sean's "don't scroll if there's nothing to scroll" is answered inside the
 * app by ui.tsx's `Scroll`, which the native builds honour. The web half
 * looked like a one-liner — `overscroll-behavior: none` on html,body, which
 * stops iOS Safari dragging the whole document — and it was written, and it
 * BROKE THE END KEY in the note body: e2e/notesswitch.spec.ts went red 3 runs
 * out of 3, typing its character at position 0 instead of at the end, and
 * green the moment the style came out again.
 *
 * That is not a harness problem. The macOS desktop shell is this same web
 * build, so it is Sean's own keyboard, and losing End in a text field to stop
 * a cosmetic bounce is the wrong trade. react-native-web does not bounce a
 * div that has nothing to scroll anyway; what remains is only the document
 * springing in the installed PWA.
 */

/**
 * The service worker, copied in beside index.html and registered from it.
 *
 * Its cache name carries the entry bundle's content hash, so every deploy is
 * a new cache and the old one is dropped on activate — nothing to remember to
 * bump. Swap WORKER to 'sw-kill.js' to ship the kill switch; see that file.
 */
const TOOLS = dirname(fileURLToPath(import.meta.url));
const WORKER = 'sw.js';
// NO SILENT FALLBACK. This used to answer 'nohash' when the regex missed, and
// everything downstream kept working while quietly meaning something else: the
// cache name stopped changing between deploys, and — the one that matters —
// CRITICAL lost the entry bundle, so `cache.addAll` had nothing left to fail
// on. The list whose entire job is to make a bad install FAIL rather than
// pretend would have installed happily, reported itself healthy, and left the
// app unable to open on a train. Exactly the shape sw.js's own header warns
// about, one file upstream of it.
//
// Measured rather than argued: with the fallback and a bundle name the pattern
// does not match, the export exits 0 with CACHE 'calmind-nohash' and CRITICAL
// ["./index.html"].
//
// Reachable on an Expo upgrade rather than in theory — apps/app/AGENTS.md
// exists because Expo's export has changed before. A build that cannot name
// its own bundle is not one worth shipping.
const bundleMatch = /index-[a-f0-9]+\.js/.exec(html);
if (!bundleMatch) {
  throw new Error(
    'patch-web-html: no index-<hash>.js in ' + file + '\n' +
      'The service worker needs the entry bundle by name — for its cache name, and for\n' +
      'CRITICAL, which is what makes a failed install loud. If the export changed how it\n' +
      'names bundles, fix this pattern rather than letting it fall back.',
  );
}
const bundle = bundleMatch[0];
// Everything the export produced, as scope-relative URLs: the document, the
// manifest, and every hashed asset — the bundle above all, which the worker
// can never catch at runtime because it does not control the load that
// registers it.
const distDir = dirname(file);
const shell = ['./', './index.html', './manifest.webmanifest'];
const walk = (dir, base = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(join(dir, entry.name), rel);
    else if (/\.(js|png|ico)$/.test(entry.name)) shell.push(`./${rel}`);
  }
};
walk(distDir);
// The document and the entry bundle: without these two, cached, the worker
// cannot open the app at all, so its install must fail rather than pretend.
const critical = ['./index.html', ...shell.filter((u) => u.endsWith(`/${bundle}`))];
const worker = readFileSync(join(TOOLS, WORKER), 'utf8')
  .replace('__BUILD__', bundle)
  .replace('__SHELL__', JSON.stringify(shell))
  .replace('__CRITICAL__', JSON.stringify(critical));
writeFileSync(join(dirname(file), 'sw.js'), worker);

// Registered after load so it never competes with the first paint, and
// swallowed entirely on failure: a browser that refuses the worker (private
// mode, an insecure origin) must still get the app.
if (!/id="chefmind-sw"/.test(html)) {
  html = html.replace(
    '</head>',
    '<script id="chefmind-sw">' +
      "if('serviceWorker' in navigator){window.addEventListener('load',function(){" +
      "navigator.serviceWorker.register('sw.js').catch(function(){});});}" +
    '</script></head>',
  );
}

writeFileSync(join(dirname(file), 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
if (!/rel=["']manifest["']/i.test(html)) {
  html = html.replace('</head>', '<link rel="manifest" href="manifest.webmanifest"/></head>');
}

if (html !== before) {
  writeFileSync(file, html);
  console.log(`patched ${file}`);
} else {
  console.log(`${file} already carries the web-app head`);
}

// What this export was built FROM, by content. CalMind's e2e/freshness.ts
// reads its twin; nothing reads this one yet, and it costs a few hundred bytes
// to have the same answer available when something does. Written
// last, so it only appears once the export has actually completed — a
// half-finished export leaves no manifest and freshness falls back to mtimes.
writeFileSync(join(dirname(file), '.sources.json'), JSON.stringify(sourceHashes(), null, 1) + '\n');

