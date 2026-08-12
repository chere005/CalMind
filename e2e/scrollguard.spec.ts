/**
 * Every scrolling view in the app goes through `Scroll`, never ScrollView.
 *
 * Sean, 2026-08-12: "don't scroll if there's nothing to scroll on all of the
 * app". The rule is one prop — `alwaysBounceVertical={false}` — and the
 * failure mode is not that it is wrong but that the NEXT screen forgets it.
 * There were 21 ScrollViews when this was asked for; a fix applied 21 times
 * is a fix that lasts until the 22nd.
 *
 * So the prop lives in ui.tsx's `Scroll` and this reads the source to keep it
 * the only door. Source rather than behaviour, deliberately and for the same
 * reason clocksetting.spec.ts reads source: bounce is a NATIVE behaviour that
 * a browser cannot show — react-native-web ignores the prop entirely, because
 * a div with overflow does not rubber-band. Driving screens here would prove
 * nothing about the thing being asked for.
 */
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'apps', 'app', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('nothing renders a bare ScrollView — they all go through Scroll', () => {
  const offenders: string[] = [];
  for (const f of walk(SRC)) {
    // ui.tsx is where Scroll is defined; it is the one place that may.
    if (f.endsWith(`${join('src', 'ui.tsx')}`)) continue;
    const src = readFileSync(f, 'utf8');
    if (src.includes('<ScrollView')) offenders.push(f.slice(f.indexOf('apps/')));
  }
  expect(offenders, 'use Scroll from ui.tsx — it carries the no-bounce rule').toEqual([]);
});

test('Scroll actually sets the rule, so the guard above is worth having', () => {
  const ui = readFileSync(join(SRC, 'ui.tsx'), 'utf8');
  const fn = ui.slice(ui.indexOf('export function Scroll'));
  expect(fn.slice(0, 400), 'no bounce when there is nothing to scroll').toContain('alwaysBounceVertical={false}');
  // NOT bounces={false}: that would kill the bounce on a long list too, where
  // it is the platform saying you have reached the end.
  expect(fn.slice(0, 400), 'a scrollable list still bounces at its end').not.toContain('bounces={false}');
});
