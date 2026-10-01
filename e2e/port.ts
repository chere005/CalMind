/**
 * The ONE place a spec learns which port its harness server is on.
 *
 * Since 2026-10-01 the deploy runs the gesture suite as parallel SHARDS
 * (server/deploy.sh), each slice against its own `php -S` on its own port over
 * its own wiped data dir. A spec that still names 8790 is then talking to
 * SOMEONE ELSE'S server whenever it is not in the first slice — and a storage
 * key with 8790 in it is a key the page in front of it never reads, which turns
 * a spec into a test of nothing: corruptboot would seed a key the app ignores,
 * boot clean, and pass.
 *
 * playwright.config.ts starts the server from the same variable, so the two
 * cannot disagree; e2e/portguard.spec.ts holds every spec to this file, and
 * proves that the key derived here is the key the app writes — on whichever
 * shard's port it lands, which is one port per run, not each. So every spec
 * that reads storage through these keys proves its own on its own port too
 * (see portguard's header for how each one does).
 * Unset, it is 8790 — a plain `npx playwright test` is what it always was.
 */
const raw = process.env.CALMIND_E2E_PORT || '8790';
if (!/^[0-9]+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
  throw new Error(`CALMIND_E2E_PORT must be a port number, got '${raw}'`);
}

export const PORT = Number(raw);

/** Where the harness serves the exported app — the config's baseURL. */
export const BASE = `http://127.0.0.1:${PORT}/calmind/`;

/** The same server by name: WebAuthn refuses an IP address as an RP id. */
export const LOCALHOST_BASE = `http://localhost:${PORT}/calmind/`;

/** The harness's API, for specs that seed or read back through it. */
export const API = `${BASE}api/index.php`;

/**
 * The storage-key suffix the app derives from its API URL — the same three
 * replaces as `instanceTag()` in apps/app/src/store.tsx, applied to the same
 * URL, so a change there that this misses fails portguard, and the specs
 * that read storage, on whatever port they run rather than turning those
 * specs vacuous.
 */
export const INSTANCE_TAG = API.replace(/^https?:\/\//, '')
  .replace(/\/api\/index\.php$/, '')
  .replace(/[^A-Za-z0-9.]+/g, '_');

/** The key the app keeps its session under, on this harness. */
export const SESSION_KEY = `calmind.session@${INSTANCE_TAG}`;

/** The key the app keeps one user's snapshot under, on this harness. */
export const snapshotKey = (user: string): string => `calmind.snapshot.${user}@${INSTANCE_TAG}`;
