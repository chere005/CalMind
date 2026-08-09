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
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const file = process.argv[2] ?? 'apps/app/dist/index.html';
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
  name: 'CalMind',
  short_name: 'CalMind',
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
if (!/id="calmind-bg"/.test(html)) {
  html = html.replace(
    '</head>',
    '<style id="calmind-bg">html,body{background-color:#111111}</style></head>',
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
