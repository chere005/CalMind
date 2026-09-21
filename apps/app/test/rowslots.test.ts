/**
 * Where a dragged recipe lands — the half of the row drag that was wrong.
 *
 * Sean, 2026-09-19: "dragging was buggy in chefmind for recipes when sections
 * were closed and between sections generally". Both halves of that are here:
 * a section that is SHUT contributes only its header (its rows are not drawn,
 * so they are not entries and cannot throw the indices off), and the header
 * itself is an entry, which is what finally makes "the end of this section" a
 * place a row can be dropped instead of a boundary that spans the header and
 * always meant the next section down.
 *
 * The screen has no browser harness in this repo, so this is the teeth.
 */
import { describe, expect, test } from 'vitest';
import { dropTarget, type SlotEntry } from '../src/components/rowslots';

const H = (s: string): SlotEntry => ({ kind: 'head', sectionId: s });
const R = (s: string, id: string): SlotEntry => ({ kind: 'row', sectionId: s, id });
const E = (s: string): SlotEntry => ({ kind: 'empty', sectionId: s });

describe('two open sections', () => {
  // A: a1 a2   B: b1 b2
  const list = [H('A'), R('A', 'a1'), R('A', 'a2'), H('B'), R('B', 'b1'), R('B', 'b2')];

  test('a row dragged to the bottom of its own section STAYS in it', () => {
    // The whole complaint, in one case: this boundary sits above B's header,
    // and it used to read as "before b1" — so the recipe left the section the
    // hand had dropped it in.
    expect(dropTarget(list, 1, 2)).toEqual({ sectionId: 'A', beforeId: null });
  });

  test('one notch further down is the top of the next section', () => {
    expect(dropTarget(list, 1, 3)).toEqual({ sectionId: 'B', beforeId: 'b1' });
  });

  test('between two rows lands above the lower one', () => {
    expect(dropTarget(list, 1, 4)).toEqual({ sectionId: 'B', beforeId: 'b2' });
  });

  test('past the last row is the end of the last section', () => {
    expect(dropTarget(list, 1, 5)).toEqual({ sectionId: 'B', beforeId: null });
  });

  test('dragging upward to the very top lands above the first row', () => {
    expect(dropTarget(list, 4, 0)).toEqual({ sectionId: 'A', beforeId: 'a1' });
  });

  test('dragging upward onto a header is the end of the section above it', () => {
    expect(dropTarget(list, 4, 3)).toEqual({ sectionId: 'A', beforeId: null });
  });

  test('a header is never a drag source', () => {
    expect(dropTarget(list, 0, 3)).toBeNull();
  });
});

describe('a section that is shut', () => {
  // B is closed, so B's rows are not drawn and are not entries at all.
  const list = [H('A'), R('A', 'a1'), R('A', 'a2'), H('B'), H('C'), R('C', 'c1')];

  test('the end of A is still the end of A', () => {
    expect(dropTarget(list, 1, 2)).toEqual({ sectionId: 'A', beforeId: null });
  });

  test('a row dropped under a shut header joins that section', () => {
    expect(dropTarget(list, 1, 3)).toEqual({ sectionId: 'B', beforeId: null });
  });

  test('and the section after it is reachable, not skipped', () => {
    expect(dropTarget(list, 1, 4)).toEqual({ sectionId: 'C', beforeId: 'c1' });
  });
});

describe('an open section with nothing in it', () => {
  const list = [H('A'), R('A', 'a1'), H('B'), E('B'), H('C'), R('C', 'c1')];

  test('its placeholder takes the row', () => {
    expect(dropTarget(list, 1, 2)).toEqual({ sectionId: 'B', beforeId: null });
    expect(dropTarget(list, 1, 3)).toEqual({ sectionId: 'B', beforeId: null });
  });
});

describe('a FOLDER that is shut', () => {
  /*
   * Sean, 2026-09-21: "make it possible to drag items between sections and
   * folders." A closed folder contributed NOTHING to the flat list until
   * then — no entry, no midpoint, no boundary — so the one folder you most
   * want to file something into, the one you are not currently reading, was
   * the one folder the gesture skipped straight over.
   *
   * The screens fix it by pushing ONE head entry for a shut folder, keyed to
   * that folder's FIRST section. This rule needs no change to answer it,
   * which is the point: a shut folder and a shut section are the same
   * question one level apart. What is pinned here is the SHAPE the screens
   * now build, because that contract is the half a screen can get wrong.
   *
   * A: open, one row. F: a shut folder standing in as its first section, f1.
   * C: open, one row.
   */
  const list = [H('A'), R('A', 'a1'), H('f1'), H('C'), R('C', 'c1')];

  test('takes a row dropped under the folder, into its first section', () => {
    expect(dropTarget(list, 1, 2)).toEqual({ sectionId: 'f1', beforeId: null });
  });

  test('leaves the section after the folder reachable, not swallowed', () => {
    expect(dropTarget(list, 1, 3)).toEqual({ sectionId: 'C', beforeId: 'c1' });
  });

  test('reads the boundary ABOVE the shut folder as the end of the section over it', () => {
    // Dragging c1 up onto the folder's head: above a header is always the
    // end of whatever is drawn above, and a shut folder is a header like
    // any other as far as this rule is concerned.
    expect(dropTarget(list, 4, 2)).toEqual({ sectionId: 'A', beforeId: null });
  });
});
