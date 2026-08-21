/**
 * The note body's one safety property: rendering never eats the text.
 *
 * richLines is render-only — the raw body is what is stored — so a bug here
 * cannot lose Sean's data. It can lose his WORDS on screen, which is the same
 * thing to the person reading them, and it would show up as a note that is
 * subtly missing a character rather than as anything anyone would report.
 *
 * THREE checks, because any two of them pass for a parser that has gone wrong:
 *
 *   - the runs are a SUBSEQUENCE of the line — nothing invented, nothing
 *     reordered;
 *   - everything removed is a marker character, so no word is ever the thing
 *     that went;
 *   - and the markers really were removed. Without this last one a parser that
 *     returned the line untouched would sail through both of the others — it
 *     removes nothing, and nothing is exactly a subset of the markers.
 */
import { describe, it, expect } from 'vitest';
import { richLines } from '../src/richtext';

/** What the line looked like after its prefix was taken off. */
function afterPrefix(raw: string): string {
  if (raw.startsWith('> ') || raw.startsWith('- ')) return raw.slice(2);
  const m = /^(\d{1,2})[.)] /.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}

/**
 * Is `sub` a subsequence of `all`, and what did it skip?
 *
 * BY CODE UNIT, deliberately, and this is not a detail: written with
 * `for (const ch of all)` it walks code POINTS while indexing `sub` by code
 * unit, so an emoji's surrogate pair never lines up and every body containing
 * one is reported as text loss. That is what it did on its first run — the
 * failure was in this helper, not in richLines, which reassembles a pair
 * correctly because a marker is ASCII and cannot sit between its halves.
 */
function skipped(all: string, sub: string): string | null {
  let i = 0;
  let out = '';
  for (let k = 0; k < all.length; k++) {
    if (i < sub.length && sub[i] === all[k]) { i++; continue; }
    out += all[k];
  }
  return i === sub.length ? out : null;
}

const ALPHABET = ['a', 'b', ' ', '*', '_', '>', '-', '1', '.', ')', '\n', 'é', '🙂'];

describe('richLines never eats the text', () => {
  /**
   * 30s, not vitest's default 5s. This walks ten thousand generated bodies and takes
   * five to seven seconds on an idle machine — so it passed here and timed
   * out inside a deploy, which runs it while an export and a browser suite
   * are competing for the same cores. It refused four deploys on
   * 2026-08-20 before the cause was read rather than guessed at: the failure
   * says "Test timed out in 5000ms", not an assertion.
   *
   * The check is unchanged. Only the clock it is given is, and a fuzz test
   * that walks ten thousand generated bodies has every right to take seconds.
   */
  it('over ten thousand random bodies', { timeout: 30_000 }, () => {
    let seed = 4242;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let t = 0; t < 10_000; t++) {
      let body = '';
      for (let i = 0, n = rnd(14); i < n; i++) body += ALPHABET[rnd(ALPHABET.length)]!;
      const lines = richLines(body);
      const raws = body.split('\n');
      expect(lines.length, `line count for ${JSON.stringify(body)}`).toBe(raws.length);
      for (let li = 0; li < raws.length; li++) {
        const inner = afterPrefix(raws[li]!);
        const got = lines[li]!.runs.map((r) => r.text).join('');
        const gone = skipped(inner, got);
        expect(gone, `runs are a subsequence of ${JSON.stringify(inner)} (got ${JSON.stringify(got)})`).not.toBeNull();
        // Only ever markers, never a character of the note.
        expect(
          /^[*_]*$/.test(gone ?? 'x'),
          `only markers removed from ${JSON.stringify(inner)}; lost ${JSON.stringify(gone)}`,
        ).toBe(true);
        // Every '*' toggles and is consumed, closed or not; '__' likewise. A
        // LONE '_' is literal and may stay, which is why this is not /[*_]/.
        //
        // PER RUN for the underscore, not on the join, and that distinction is
        // the whole check: ">>é_*_-" parses to [">>é_", "_-"], two runs each
        // holding one literal underscore either side of a consumed '*'. Joined
        // they read as '__' and this fired — a fault in the checking, not in
        // the parser. Inside ONE run two adjacent underscores cannot both be
        // literal, because the parser would have eaten them.
        for (const r of lines[li]!.runs) {
          expect(r.text.includes('*'), `asterisk survived: raw=${JSON.stringify(raws[li])} run=${JSON.stringify(r.text)}`).toBe(false);
          expect(r.text.includes('__'), `double underscore survived: raw=${JSON.stringify(raws[li])} run=${JSON.stringify(r.text)}`).toBe(false);
        }
      }
    }
  });

  it('a line is always at least one run, so a blank line still draws', () => {
    expect(richLines('')[0]!.runs).toEqual([{ text: '' }]);
    expect(richLines('a\n\nb')[1]!.runs).toEqual([{ text: '' }]);
  });
});
