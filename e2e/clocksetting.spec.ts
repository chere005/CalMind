import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every surface that prints a time honours the 12/24-hour setting.
 *
 * One pref, four surfaces, and the two native ones get it through the feed —
 * so the failure mode is a straggler: a screen that calls timeLabel() and
 * forgets the flag prints 12-hour whatever the setting says. QuickTick was
 * exactly that, found by grep after the feature was already shipped and
 * deployed, which is the sort of thing a person notices before a test does.
 *
 * This reads the SOURCE rather than driving each screen. Some of these pages
 * are behind a partner handshake, and a spec that toured them all would be a
 * tour rather than a check. The rule is one line: if you call timeLabel, you
 * pass the flag.
 */
const SRC = join(__dirname, '..', 'apps', 'app', 'src');

function sources(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('no surface calls timeLabel without the clock setting', () => {
  const bare: string[] = [];
  for (const file of sources()) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // The definition and the hook itself are not callers.
        if (/export function timeLabel/.test(line)) return;
        for (const m of line.matchAll(/\btimeLabel\(([^)]*)\)/g)) {
          const args = m[1]!;
          if (!/,/.test(args)) bare.push(`${file.split('/src/')[1]}:${i + 1}  timeLabel(${args})`);
        }
      });
  }
  expect(
    bare,
    'a screen that calls timeLabel without the flag prints 12-hour whatever Settings says',
  ).toEqual([]);
});
