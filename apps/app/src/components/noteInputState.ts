import { noteBulletDots, noteListEdit } from '@calmind/core';

export type InputSelection = { start: number; end: number };
export type NoteInputState = { raw: string; text: string; offsets: number[] | null };
type TextEdit = { start: number; end: number; insert: string };

export function noteInputState(text: string): NoteInputState {
  return { raw: text, text, offsets: null };
}

// A native change is one replacement. Use its caret to disambiguate repeated
// newlines/letters; without a caret, use the smallest changed range.
function textEdit(before: string, after: string, caret?: number): TextEdit {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let nextEnd = after.length;
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
  if (caret !== undefined && caret >= 0 && caret <= after.length) {
    const oldEnd = before.length - (after.length - caret);
    if (oldEnd >= 0 && before.slice(oldEnd) === after.slice(caret)) {
      end = oldEnd;
      nextEnd = caret;
      start = Math.min(start, end, nextEnd);
    }
  }
  return { start, end, insert: after.slice(start, nextEnd) };
}

function editSize(edit: TextEdit): number {
  return edit.end - edit.start + edit.insert.length;
}

function offsetAfterEdit(offset: number, edit: TextEdit): number {
  if (offset < edit.start) return offset;
  if (offset >= edit.end) return offset + edit.insert.length - (edit.end - edit.start);
  return edit.start + edit.insert.length;
}

export function noteInputSelection(state: NoteInputState, selection: InputSelection): InputSelection {
  const at = (offset: number) => state.offsets?.[Math.max(0, Math.min(state.raw.length, offset))] ?? offset;
  return { start: at(selection.start), end: at(selection.end) };
}

/** Rebase native edits that arrive before an earlier JS list correction lands. */
export function editNoteInput(state: NoteInputState, next: string, selection?: InputSelection, bulletDots = false): {
  state: NoteInputState; selection: InputSelection;
} {
  const caret = selection?.start === selection?.end ? selection?.end : undefined;
  const rawEdit = textEdit(state.raw, next, caret);
  const correctedEdit = textEdit(state.text, next, caret);
  // Native either still has the last raw value, or has applied our corrected
  // value. The smaller replacement identifies the input operation in each.
  // A change equal to the old raw snapshot can be the user deleting an
  // applied automatic marker. A native change cannot be a raw no-op.
  const rawSize = editSize(rawEdit);
  const useRaw = state.raw !== state.text && rawSize > 0 && rawSize < editSize(correctedEdit);
  const edit = useRaw ? rawEdit : correctedEdit;
  const at = (offset: number) => useRaw ? state.offsets?.[offset] ?? offset : offset;
  const start = at(edit.start);
  const end = at(edit.end);
  const inserted = state.text.slice(0, start) + edit.insert + state.text.slice(end);
  // Marker projection is length preserving, so it must not be folded into
  // the edit-size/rebase decision above. Doing it here keeps native event
  // offsets positional while list continuation can still recognize `• `.
  const candidate = bulletDots ? noteBulletDots(inserted) : inserted;
  const listEdit = noteListEdit(state.text, candidate);
  const text = listEdit?.text ?? candidate;
  const generated = listEdit ? textEdit(candidate, text, listEdit.caret) : null;
  const shift = edit.insert.length - (end - start);
  const insertedEnd = edit.start + edit.insert.length;
  const mapOffset = (offset: number) => {
    let mapped: number;
    if (offset < edit.start) mapped = at(offset);
    else if (offset <= insertedEnd) mapped = start + offset - edit.start;
    else mapped = at(offset - edit.insert.length + edit.end - edit.start) + shift;
    return generated ? offsetAfterEdit(mapped, generated) : mapped;
  };
  const nextSelection = listEdit
    ? { start: listEdit.caret, end: listEdit.caret }
    : {
      start: mapOffset(selection?.start ?? insertedEnd),
      end: mapOffset(selection?.end ?? insertedEnd),
    };
  const offsets = next === text ? null : Array.from({ length: next.length + 1 }, (_, offset) => mapOffset(offset));
  return { state: { raw: next, text, offsets }, selection: nextSelection };
}
