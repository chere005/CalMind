import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasCalendarFeed, normalizeSubUrl, subCalendarName, subIdentity, subSourceLabel } from '../src/calimport';
import type { CalSub } from '../src/types';

type Pointer = Pick<CalSub, 'url' | 'source' | 'username'>;
type Contract = {
  url: { name: string; input: string; source?: CalSub['source']; expect: string | null }[];
  labels: { name: string; sub: Pointer; expect: string }[];
  identity: { name: string; left: Pointer; right: Pointer; equal: boolean }[];
  names: { name: string; ics: string; fallback: string; expect: string }[];
  feeds: { name: string; ics: string; expect: boolean }[];
};
const contract = JSON.parse(readFileSync(fileURLToPath(new URL('../../../spec/calimport.json', import.meta.url)), 'utf8')) as Contract;

describe('spec/calimport.json — read-only calendar import', () => {
  for (const c of contract.url) it(c.name, () => expect(normalizeSubUrl(c.input, c.source)).toBe(c.expect));
  for (const c of contract.labels) it(c.name, () => expect(subSourceLabel(c.sub)).toBe(c.expect));
  for (const c of contract.identity) it(c.name, () => expect(subIdentity(c.left) === subIdentity(c.right)).toBe(c.equal));
  for (const c of contract.names) it(c.name, () => expect(subCalendarName(c.ics, c.fallback)).toBe(c.expect));
  for (const c of contract.feeds) it(c.name, () => expect(hasCalendarFeed(c.ics)).toBe(c.expect));
});
