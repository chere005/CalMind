import { describe, it, expect } from 'vitest';
import { searchRecords } from '../src/search';
import type { AnyRec } from '../src/index';

const rec = (id: string, type: string, updated: number, payload: object, deleted = false): AnyRec =>
  ({ id, type, updated, deleted, payload } as unknown as AnyRec);

const STORE: AnyRec[] = [
  rec('r1', 'reminder', 500, { text: 'buy milk', due: '2026-08-20', done: false }),
  rec('r2', 'reminder', 400, { text: 'return milk crates to the farm', due: null, done: true }),
  rec('n1', 'note', 300, { title: 'Milk', body: 'oat, whole, none', date: null }),
  rec('n2', 'note', 200, { title: 'Shopping thoughts', body: 'we are always out of milk', date: '2026-08-18' }),
  rec('e1', 'event', 100, { text: 'milk delivery', date: '2026-08-25', time: '09:00' }),
  rec('x1', 'event', 900, { text: 'dentist', date: '2026-08-21' }),
  rec('gone', 'reminder', 950, { text: 'milk the deleted goat', due: null, done: false }, true),
  rec('h1', 'habit', 960, { name: 'milk?? not searched' }),
];

describe('searchRecords', () => {
  it('searches the three kinds, best first, and nothing else', () => {
    const hits = searchRecords(STORE, 'milk');
    // n1 exact title (100) · e1 leads with it (80) · r1 and r2 carry it at
    // a word boundary (60, fresher edit first) · n2 only mentions it in the
    // body (30 — half of a body's 60).
    expect(hits.map((h) => h.id)).toEqual(['n1', 'e1', 'r1', 'r2', 'n2']);
    expect(hits.find((h) => h.id === 'gone')).toBeUndefined();
    expect(hits.find((h) => h.id === 'h1')).toBeUndefined();
  });

  it('a done reminder still turns up, and says so', () => {
    const done = searchRecords(STORE, 'crates')[0]!;
    expect(done.id).toBe('r2');
    expect(done.done).toBe(true);
  });

  it('the kind filter cuts, and an empty filter means everything', () => {
    expect(searchRecords(STORE, 'milk', { kinds: ['note'] }).every((h) => h.kind === 'note')).toBe(true);
    expect(searchRecords(STORE, 'milk', { kinds: [] }).length).toBe(5);
  });

  it('scattered words still find a note by its body', () => {
    const hits = searchRecords(STORE, 'always milk');
    expect(hits.map((h) => h.id)).toContain('n2');
  });

  it('date sort runs the dates, undated last in BOTH directions', () => {
    const asc = searchRecords(STORE, 'milk', { sort: 'date' });
    expect(asc.map((h) => h.id)).toEqual(['n2', 'r1', 'e1', 'r2', 'n1']);
    const desc = searchRecords(STORE, 'milk', { sort: 'date', desc: true });
    expect(desc.map((h) => h.id)).toEqual(['e1', 'r1', 'n2', 'r2', 'n1']);
  });

  it('alphabetical uses the whole visible text, either way up', () => {
    const az = searchRecords(STORE, 'milk', { sort: 'alpha' });
    expect(az.map((h) => h.text)).toEqual([
      'buy milk', 'Milk', 'milk delivery', 'return milk crates to the farm', 'Shopping thoughts',
    ]);
    const za = searchRecords(STORE, 'milk', { sort: 'alpha', desc: true });
    expect(za.map((h) => h.text)).toEqual([
      'Shopping thoughts', 'return milk crates to the farm', 'milk delivery', 'Milk', 'buy milk',
    ]);
  });

  it('an empty query is an empty answer, not everything', () => {
    expect(searchRecords(STORE, '   ')).toEqual([]);
  });
});
