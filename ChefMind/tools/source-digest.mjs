/**
 * What the web export was built FROM, by content.
 *
 * e2e/freshness.ts used to answer "is the export current?" by comparing
 * mtimes, and that is not the same question. Two sessions share this repo, and
 * an ordinary `git` operation in the other one — a pull with autostash, a
 * checkout, a stash pop — rewrites files it is restoring to identical content.
 * Their mtimes move; nothing about the code changes. On 2026-08-12 that made a
 * perfectly current export read as STALE three times in one session, each time
 * naming `packages/core/src/order.ts`, which had no diff against HEAD at all.
 *
 * A gate that cries wolf is on its way to being deleted by whoever it blocks
 * first — deploy-test.sh says as much about hiding a gate's reason. So the
 * question is asked by CONTENT: the export writes down a hash per source file,
 * and freshness compares hashes. A touched file is fresh. A changed one is not,
 * and can be named, which is more use than "the newest file" ever was.
 *
 * Written by tools/patch-web-html.mjs, which is the last step of
 * `npm run export:web`, and read by e2e/freshness.ts.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Everything the bundle is built from. Kept here so the writer and the
 *  reader cannot disagree about what counts as a source. */
export const SOURCES = [
  'app/src',
  'app/App.tsx',
  'app/index.ts',
  'packages/core/src',
];

const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/;

function walk(path, out) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (!st.isDirectory()) {
    if (CODE.test(path)) out.push(path);
    return;
  }
  for (const entry of readdirSync(path).sort()) walk(join(path, entry), out);
}

/** `{ 'relative/path.ts': '<sha256>' }` for every source file, sorted. */
export function sourceHashes() {
  const files = [];
  for (const s of SOURCES) walk(s, files);
  files.sort();
  const out = {};
  for (const f of files) {
    out[f] = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
  }
  return out;
}

/** What changed between a recorded map and the tree as it is now. */
export function changedSince(recorded) {
  const now = sourceHashes();
  const changed = [];
  for (const [f, h] of Object.entries(now)) {
    if (recorded[f] === undefined) changed.push(`${f} (new)`);
    else if (recorded[f] !== h) changed.push(f);
  }
  for (const f of Object.keys(recorded)) {
    if (now[f] === undefined) changed.push(`${f} (deleted)`);
  }
  return changed;
}
