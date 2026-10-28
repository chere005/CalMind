import { expect, test } from 'vitest';
import { editNoteInput, noteInputSelection, noteInputState, type NoteInputState } from '../src/components/noteInputState';

const change = (state: NoteInputState, text: string, caret = text.length) =>
  editNoteInput(state, text, { start: caret, end: caret });
const changeWithDots = (state: NoteInputState, text: string, caret = text.length) =>
  editNoteInput(state, text, { start: caret, end: caret }, true);

test('Return, Return and a letter survive before either native correction is acknowledged', () => {
  let result = change(noteInputState('* Soup'), '* Soup\n');
  expect(result.state.text).toBe('* Soup\n* ');
  result = change(result.state, '* Soup\n\n');
  expect(result.state.text).toBe('* Soup\n');
  result = change(result.state, '* Soup\n\nP');
  expect(result.state.text).toBe('* Soup\nP');
  expect(result.selection).toEqual({ start: 8, end: 8 });
  // The next event finally includes the corrected value.
  result = change(result.state, '* Soup\nPl');
  expect(result.state.text).toBe('* Soup\nPl');
  expect(result.selection).toEqual({ start: 9, end: 9 });
});

test('an acknowledged continuation followed by a delayed list exit keeps the next word', () => {
  let result = change(noteInputState('* Soup'), '* Soup\n');
  result = change(result.state, '* Soup\n* Soup');
  result = change(result.state, '* Soup\n* Soup\n');
  result = change(result.state, '* Soup\n* Soup\n* \n');
  result = change(result.state, '* Soup\n* Soup\n* \nPlain');
  expect(result.state.text).toBe('* Soup\n* Soup\nPlain');
  expect(result.selection.end).toBe(result.state.text.length);
});

test('a queued mid-line split keeps the caret and following text on their respective sides', () => {
  let result = change(noteInputState('* BeforeAfter\nTail'), '* Before\nAfter\nTail', 9);
  expect(result.state.text).toBe('* Before\n* After\nTail');
  expect(result.selection).toEqual({ start: 11, end: 11 });
  result = change(result.state, '* Before\nNew After\nTail', 13);
  expect(result.state.text).toBe('* Before\n* New After\nTail');
  expect(result.selection).toEqual({ start: 15, end: 15 });
  // The text after the split can itself start with the same marker.
  result = change(noteInputState('* Before* After\nTail'), '* Before\n* After\nTail', 9);
  result = change(result.state, '* Before\nNew * After\nTail', 13);
  expect(result.state.text).toBe('* Before\n* New * After\nTail');
  expect(result.selection).toEqual({ start: 15, end: 15 });
});

test('a multi-line paste following an unacknowledged list exit is preserved literally', () => {
  let result = change(noteInputState('* Soup'), '* Soup\n');
  result = change(result.state, '* Soup\n* \n');
  result = change(result.state, '* Soup\n* \nkeep\n* literal');
  expect(result.state.text).toBe('* Soup\nkeep\n* literal');
  expect(result.selection.end).toBe(result.state.text.length);
});

test('selection replacement and backspace preserve user text across a pending marker', () => {
  let result = change(noteInputState('* OneTail'), '* One\nTail', 6);
  expect(noteInputSelection(result.state, { start: 6, end: 10 })).toEqual({ start: 8, end: 12 });
  result = change(result.state, '* One\nTea\nraw');
  expect(result.state.text).toBe('* One\n* Tea\nraw');
  result = change(result.state, '* One\nTea\nra');
  expect(result.state.text).toBe('* One\n* Tea\nra');
  expect(result.selection.end).toBe(result.state.text.length);
});

test('selecting and deleting an applied automatic marker does not resurrect it', () => {
  const result = change(noteInputState('* One'), '* One\n');
  // Native applied "* ", then the user selected those two characters and
  // deleted them. Its new text happens to equal the older raw snapshot.
  const deleted = change(result.state, '* One\n');
  expect(deleted.state.text).toBe('* One\n');
  expect(deleted.selection).toEqual({ start: 6, end: 6 });
});

test('daily log input normalizes new markers and continues dot bullets across queued native events', () => {
  let result = changeWithDots(noteInputState(''), '* first');
  expect(result.state.text).toBe('• first');
  // The next native event may still carry the just-typed asterisk marker;
  // reconciliation maps its positions onto the normalized bullet text.
  result = changeWithDots(result.state, '* first\n');
  expect(result.state.text).toBe('• first\n• ');
  result = changeWithDots(result.state, '* first\n\n');
  expect(result.state.text).toBe('• first\n');
  result = changeWithDots(result.state, '* first\n\nnext');
  expect(result.state.text).toBe('• first\nnext');
  expect(result.selection).toEqual({ start: 12, end: 12 });
});

test('same-length marker normalization keeps selection positions independent of newline rebasing', () => {
  let result = changeWithDots(noteInputState('• keep'), '* keep!');
  expect(result.state.text).toBe('• keep!');
  expect(result.selection).toEqual({ start: 7, end: 7 });
  expect(noteInputSelection(result.state, { start: 1, end: 2 })).toEqual({ start: 1, end: 2 });
  result = changeWithDots(result.state, '* keep!\n');
  expect(result.state.text).toBe('• keep!\n• ');
  expect(result.selection.end).toBe(result.state.text.length);
});
