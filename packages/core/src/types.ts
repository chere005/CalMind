/**
 * The synced record model. Sync metadata (id, type, updated, deleted) stays in the
 * clear so the server can merge without reading content; everything the user wrote
 * lives in `payload`, which the server treats as opaque. The later E2EE step
 * encrypts `payload` alone — nothing about the protocol changes.
 *
 * Folders, sections and calendars are records with their own ids, and items
 * reference them BY ID — a lesson from the web suite, where name-keyed folders
 * meant every rename had to chase references through five files. Here a rename
 * touches one record.
 *
 * Record type names are all-lowercase on purpose: the server admits new types by
 * pattern, so the whole suite model shipped without a server change.
 */

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/** "Every 2 weeks" is { n: 2, unit: 'week' }; null happens once. */
export type Repeat = { n: number; unit: RepeatUnit };

/**
 * A folder belongs to one app ('reminders' | 'notes'; absent = 'reminders', the
 * shape milestone 1 wrote). `rideAlong` is the suite's Calendar folder made a
 * property instead of a magic name: an UNDATED open reminder in a rideAlong
 * folder shows on the calendar under today, every day, until ticked — and the
 * folder itself refuses deletion, since the behavior is the identity.
 */
export type Folder = { name: string; color: string; ord: string; app?: 'reminders' | 'notes'; rideAlong?: boolean };
export type Section = { name: string; folderId: string; ord: string };
export type Reminder = {
  text: string;
  due: string | null; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM' 24-hour
  done: boolean;
  repeat: Repeat | null;
  folderId: string;
  sectionId: string;
  indent: 0 | 1; // 1 = subtask of the nearest indent-0 row above (stored order)
  ord: string; // fractional order key within its section — see order.ts
};

export type CalendarPayload = { name: string; color: string; ord: string };
export type Event = {
  text: string;
  date: string; // events always have a date — today by default
  time: string | null;
  repeat: Repeat | null;
  calendarId: string;
  ord: string;
};

/** Note bodies are plain text, as in the native apps (the web suite's rich text
 *  is a later milestone). An optional date puts the note on the calendar. */
export type Note = { title: string; body: string; date: string | null; folderId: string; sectionId: string; ord: string };

export type HabitSection = { name: string; color: string; ord: string };
export type Habit = { name: string; sectionId: string; ord: string };
/** One tick of one habit on one day. Deterministic id (tickId) makes the same
 *  tick from two devices the same record, so LWW converges instead of doubling. */
export type Tick = { habitId: string; date: string };

/**
 * Per-app view preferences, synced like everything else (deterministic id via
 * prefsId, whole-record LWW — the last device to change a pref wins). Ids in
 * here are re-validated on read, so a deleted folder silently reverts, exactly
 * the suite's rule for its stored prefs.
 */
export type Prefs = {
  lastView?: string; // 'all' or a folderId
  hidden?: string[]; // folderIds switched off in the All view
  defaultSectionId?: string; // where new items land from All (reminders/notes)
  defaultCalendarId?: string; // where new events land (calendar)
};

export type RecType =
  | 'folder'
  | 'section'
  | 'reminder'
  | 'event'
  | 'note'
  | 'calendar'
  | 'habit'
  | 'habitsection'
  | 'tick'
  | 'pref';

export type PayloadOf = {
  folder: Folder;
  section: Section;
  reminder: Reminder;
  event: Event;
  note: Note;
  calendar: CalendarPayload;
  habit: Habit;
  habitsection: HabitSection;
  tick: Tick;
  pref: Prefs;
};

export type Rec<T extends RecType = RecType> = {
  id: string;
  type: T;
  updated: number; // ms epoch of the last edit — the last-write-wins vote
  deleted?: boolean; // tombstone: synced so every device learns of the delete
  payload: PayloadOf[T];
};

export type AnyRec = { [T in RecType]: Rec<T> }[RecType];

/** The app a folder serves; milestone-1 records carried no `app`. */
export function folderApp(f: Folder): 'reminders' | 'notes' {
  return f.app ?? 'reminders';
}

/** The one id a tick can have, so ticking twice on two devices converges. */
export function tickId(habitId: string, date: string): string {
  return `t_${habitId}_${date.replace(/-/g, '')}`;
}

/** The one prefs record per app — same-device and cross-device edits converge. */
export function prefsId(app: 'reminders' | 'notes' | 'calendar'): string {
  return `prefs_${app}`;
}

/** 12 hex chars, the suite's id shape. Injectable RNG keeps core dependency-free. */
export function newId(rng: (bytes: number) => Uint8Array = defaultRng): string {
  return Array.from(rng(6), (b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultRng(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(buf);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}
