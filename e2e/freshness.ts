/**
 * Refuse to run the gesture suite against a stale export.
 *
 * The specs drive `apps/app/dist`, not the source, so an edit that never
 * made it through `npm run export:web` is tested in its absence — and the
 * suite says PASS for code that isn't there, or FAIL for a fix that is.
 * That is the worst kind of green: it looks like an answer. It has cost
 * real time twice (a `cd` left the shell in apps/app, the export's `&&`
 * chain short-circuited, and the run afterwards quietly used yesterday's
 * bundle), and TESTING.md already names a stale dist as the usual reason a
 * spec disagrees with dev.
 *
 * So: compare the newest source file against the export and stop with an
 * instruction rather than a mystery.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = ['apps/app/src', 'apps/app/App.tsx', 'apps/app/index.ts', 'packages/core/src'];
const BUILT = 'apps/app/dist/index.html';

function newestMtime(path: string): { at: number; file: string } {
  const st = statSync(path);
  if (!st.isDirectory()) return { at: st.mtimeMs, file: path };
  let best = { at: 0, file: path };
  for (const entry of readdirSync(path)) {
    const found = newestMtime(join(path, entry));
    if (found.at > best.at) best = found;
  }
  return best;
}

export default function checkExportIsFresh() {
  if (!existsSync(BUILT)) {
    throw new Error(`No web export at ${BUILT}. Run: npm run export:web`);
  }
  const built = statSync(BUILT).mtimeMs;
  let newest = { at: 0, file: '' };
  for (const src of SOURCES) {
    if (!existsSync(src)) continue;
    const found = newestMtime(src);
    if (found.at > newest.at) newest = found;
  }
  if (newest.at > built) {
    const behind = Math.round((newest.at - built) / 1000);
    throw new Error(
      `The web export is STALE — ${newest.file} is ${behind}s newer than ${BUILT}.\n` +
        `The specs drive the export, so this run would test the old bundle.\n` +
        `Run: npm run export:web`,
    );
  }
}
