import { Platform } from 'react-native';

/**
 * Where the sync API lives.
 *
 * ChefMind has NO API OF ITS OWN. It talks to CalMind's, because that is where
 * the accounts are — Sean, 2026-08-21: "we might as well reuse calmind
 * logins." Its data is kept apart by the sync SPACE (see api.ts), not by a
 * second server, a second data dir or a second set of users.
 *
 * So the path is `/calmind/api/index.php` wherever this page is served from,
 * and it is built from the page's ORIGIN rather than baked. ChefMind lives at
 * /ChefMind and the API at /calmind/api — same origin, different path — so
 * neither of the two obvious answers is right: `new URL('api/index.php',
 * location.href)` resolves to /ChefMind/api, which is nothing, and a hardcoded
 * https://seancheren.com/... would make a page served from a laptop write into
 * PRODUCTION. That second one is not a hypothetical: it is what this file said
 * first, and running the app locally under it would have merged test records
 * into Sean's real store through an API that does not yet know the space.
 *
 * Native has no origin, so it gets prod. That is the same call CalMind makes
 * and for the same reason: trying the app should mean trying your real data.
 */
const PROD_API = 'https://seancheren.com/calmind/api/index.php';

export function defaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    // THE DESKTOP SHELL HAS AN ORIGIN, AND IT IS A LIE. Tauri serves the
    // bundle from tauri://localhost, so deriving the API from the origin aims
    // it at tauri://localhost/calmind/api/index.php — a path the asset
    // protocol answers with index.html, which apiPost reads as a server
    // error. That is the "server error (500)" on the Mac app's login card
    // (Sean, 2026-08-21, first launch). CalMind's config carries this same
    // branch; dropping it when this file was rewritten is what put it there.
    if (location.protocol === 'tauri:' || location.hostname === 'tauri.localhost') return PROD_API;
    // Metro's own port serves no api/ and never will, so the dev server is
    // the one case that needs an absolute local fallback.
    if (['8081', '19006'].includes(location.port)) return 'http://127.0.0.1:8788/api/index.php';
    return `${location.origin}/calmind/api/index.php`;
  }
  return PROD_API;
}
