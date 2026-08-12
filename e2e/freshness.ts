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
 * So: compare the source against the export and stop with an instruction
 * rather than a mystery.
 *
 * BY CONTENT, since 2026-08-12, and mtime only as the fallback. Two sessions
 * share this repo and an ordinary git operation in the other one rewrites
 * files to identical content — the mtime moves, the code does not. That read
 * as STALE three times in one session for `packages/core/src/order.ts`, which
 * had no diff against HEAD. Three needless re-exports is how a gate starts
 * being worked around. See tools/source-digest.mjs; the export writes a hash
 * per file and this compares them, which also lets the error NAME what
 * changed instead of pointing at whichever file was touched last.
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// Shared with the writer so the two cannot disagree about what a source is.
// @ts-expect-error — plain ESM helper; e2e is not in a tsconfig.
import { changedSince } from '../tools/source-digest.mjs';

const SOURCES = ['apps/app/src', 'apps/app/App.tsx', 'apps/app/index.ts', 'packages/core/src'];
const BUILT = 'apps/app/dist/index.html';
const MANIFEST = 'apps/app/dist/.sources.json';

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
  // The content answer, when the export left one behind.
  if (existsSync(MANIFEST)) {
    let recorded: Record<string, string> | null = null;
    try {
      recorded = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, string>;
    } catch {
      // A manifest that will not parse tells us nothing; fall through to
      // mtimes rather than treat an unreadable file as agreement.
      recorded = null;
    }
    if (recorded) {
      const changed: string[] = changedSince(recorded);
      if (changed.length === 0) return;
      throw new Error(
        `The web export is STALE — ${changed.length} source file(s) changed since it was built:\n` +
          changed.slice(0, 8).map((f) => `  · ${f}`).join('\n') +
          (changed.length > 8 ? `\n  · …and ${changed.length - 8} more` : '') +
          `\nThe specs drive the export, so this run would test the old bundle.\n` +
          `Run: npm run export:web`,
      );
    }
  }

  // No manifest (an export from before this existed, or one that did not
  // finish): the original mtime rule, which is right more often than not.
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
