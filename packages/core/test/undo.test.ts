import { describe, it, expect } from 'vitest';
import { lastDeleted, recLabel, undeleted } from '../src/undo';
import type { AnyRec } from '../src/index';

const rec = (id: string, type: string, updated: number, payload: object, deleted = false): AnyRec =>
  ({ id, type, updated, deleted, payload } as unknown as AnyRec);

describe('undo the last delete', () => {
  it('finds the newest tombstone, not the newest record', () => {
    const recs = [
      rec('a', 'reminder', 100, { text: 'old delete' }, true),
      rec('b', 'note', 300, { title: 'newer delete' }, true),
      rec('c', 'reminder', 900, { text: 'alive and newest' }),
    ];
    expect(lastDeleted(recs)?.id).toBe('b');
  });

  it('ignores types Sean did not name', () => {
    // A section or folder delete re-homes or refuses in manage.ts rather than
    // leaving a plain tombstone, so restoring one is a different question —
    // and could resurrect a container whose contents have since moved.
    const recs = [
      rec('sec', 'section', 900, { name: 'gone' }, true),
      rec('r', 'reminder', 100, { text: 'the real answer' }, true),
    ];
    expect(lastDeleted(recs)?.id).toBe('r');
  });

  it('returns null when nothing has been deleted, so the menu can say so', () => {
    expect(lastDeleted([rec('a', 'reminder', 1, { text: 'here' })])).toBeNull();
    expect(lastDeleted([])).toBeNull();
  });

  it('undeleting only clears the flag — the stamp is the engine’s job', () => {
    const t = rec('a', 'note', 5, { title: 'back' }, true);
    const back = undeleted(t);
    expect(back.deleted).toBe(false);
    expect(back.updated, 'not restamped here; put() does that').toBe(5);
    expect(back.payload, 'the content is untouched').toEqual({ title: 'back' });
  });

  it('walks back through deletions, newest first', () => {
    // Each undo stops being a tombstone, so the next call finds the one before.
    const recs = [
      rec('a', 'reminder', 100, { text: 'first gone' }, true),
      rec('b', 'reminder', 200, { text: 'second gone' }, true),
    ];
    expect(lastDeleted(recs)?.id).toBe('b');
    const after = recs.map((r) => (r.id === 'b' ? undeleted(r) : r));
    expect(lastDeleted(after)?.id).toBe('a');
  });

  it('names the thing whatever kind it is, and copes with nothing to say', () => {
    expect(recLabel(rec('a', 'reminder', 1, { text: 'milk' }))).toBe('milk');
    expect(recLabel(rec('b', 'note', 1, { title: 'Recipe' }))).toBe('Recipe');
    expect(recLabel(rec('c', 'habit', 1, { name: 'Stretch' }))).toBe('Stretch');
    expect(recLabel(rec('d', 'note', 1, { title: '   ' }))).toBe('Untitled');
    expect(recLabel(rec('e', 'note', 1, {}))).toBe('Untitled');
  });
});
