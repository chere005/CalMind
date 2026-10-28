import type { DailyLogCard, Note, NoteType } from './types';
import { isRecipeNote } from './recipe';

export function noteType(note: Pick<Note, 'body' | 'recipe' | 'noteType'>): NoteType {
  return note.noteType ?? (isRecipeNote(note) ? 'recipe' : 'note');
}

export function addDailyLogCard(note: Note, id: string, date: string): Note {
  if (note.logCards?.some((card) => card.id === id)) return note;
  return { ...note, noteType: 'daily-log', recipe: false,
    logCards: [{ id, date, food: '', exercise: '', mood: '', graffirmations: '' }, ...(note.logCards ?? [])] };
}

export function setNoteType(note: Note, type: NoteType, id: string, date: string): Note {
  const next = { ...note, noteType: type, recipe: type === 'recipe' };
  return type === 'daily-log' && !next.logCards?.length ? addDailyLogCard(next, id, date) : next;
}

export function updateDailyLogCard(note: Note, id: string, patch: Partial<Omit<DailyLogCard, 'id'>>): Note {
  return { ...note, logCards: (note.logCards ?? []).map((card) => card.id === id ? { ...card, ...patch } : card) };
}

export function removeDailyLogCard(note: Note, id: string): Note {
  return { ...note, logCards: (note.logCards ?? []).filter((card) => card.id !== id) };
}

/** The readable content used by search and Copy as Markdown. */
export function noteBodyText(note: Note): string {
  if (noteType(note) !== 'daily-log') return note.body;
  return [note.body, ...(note.logCards ?? []).map((card) =>
    `## ${card.date}\n\n### Food\n${card.food}\n\n### Exercise\n${card.exercise}\n\n### Mood\n${card.mood}\n\n### Graffirmations\n${card.graffirmations ?? ''}`,
  )].filter(Boolean).join('\n\n');
}
