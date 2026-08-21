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
export type Folder = {
  name: string; color: string; ord: string; app?: 'reminders' | 'notes'; rideAlong?: boolean;
  /**
   * THE SHOPPING LIST (ChefMind, Sean 2026-08-21). A flag rather than a third
   * `app`, because a shopping row IS a reminder — text, a tick, an order key,
   * a swipe to delete — and everything that already handles reminders keeps
   * working. Extending the app union instead would have meant teaching
   * folderApp, prefs, normalize, search and every folder picker about a third
   * value to gain nothing this flag does not give.
   *
   * The Reminders tab excludes it and the Shopping tab shows only it, which is
   * the whole of the separation. Exactly the shape `rideAlong` already uses:
   * the name is a label, the flag is the identity.
   */
  shopping?: boolean;
};
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
  /**
   * Optional end, 'HH:MM' (Sean's ask, 2026-08-18) — meaningful only with a
   * start `time`, and absent on every event written before it existed, which
   * is why it is optional rather than nullable-required. An end past midnight
   * reads as the small hours; the event stays on its one `date`.
   */
  end?: string | null;
  repeat: Repeat | null;
  calendarId: string;
  ord: string;
};

/** Note bodies are plain text, as in the native apps (the web suite's rich text
 *  is a later milestone). An optional date puts the note on the calendar.
 *  `recipe` marks a note the Recipe page saved — the only kind that renders
 *  the inset card and its trappings. Optional because every note written
 *  before it existed has none, and reads as a plain note — which is exactly
 *  what Sean's hand-typed marker-shaped notes turned out to be (2026-08-19);
 *  see isRecipeNote in recipe.ts. */
export type Note = { title: string; body: string; date: string | null; folderId: string; sectionId: string; ord: string; recipe?: boolean };

export type HabitSection = { name: string; color: string; ord: string };
/**
 * `frequency` is optional because every habit written before it existed has
 * none, and reads as 'always' — which is exactly what they already were. See
 * habit.ts for what each value means; the two questions it answers ("is it
 * listed today" and "does it count today") are deliberately not the same.
 */
export type Habit = { name: string; sectionId: string; ord: string; frequency?: 'always' | 'weekdays' | 'never' };
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
  hiddenShared?: string[]; // a partner's shared calendar/folder ids switched off
  hiddenSubs?: string[]; // subscribed (calsub) calendar ids switched off
  sharedColors?: Record<string, string>; // viewer-side recolour of a partner's shared containers, keyed @partner:id
  defaultSectionId?: string; // where new items land from All (reminders/notes)
  defaultCalendarId?: string; // where new events land (calendar)
  // Which folders' reminders reach the calendar (the suite's tri-state):
  // 'all' = dated + undated riding on today, 'dated' = only dated, 'none' =
  // nothing. Absent = 'all' for a rideAlong folder, 'dated' otherwise.
  folderModes?: Record<string, FolderMode>;
  view?: 'week' | 'month'; // habits: which grid the bar above it picked
  theme?: string; // suite: the chosen palette (midnight when absent)
  /**
   * suite: 24-hour times instead of 12. Absent = 12-hour, which is what every
   * surface did before the setting existed, so an account that never touches
   * it sees no change.
   *
   * It lives on 'suite' rather than per app because it is one person's habit,
   * not a property of a list — and it syncs, so the phone, the web, the watch
   * and the widget agree without being set four times.
   */
  clock24?: boolean;
  /**
   * suite: which kinds the search screen includes — "remember the last
   * selected search filter always" (Sean, 2026-08-19). Synced for the same
   * reason as the clock: it is one person's habit, not a device's. Empty or
   * absent means all three; unknown entries drop out on read.
   */
  searchKinds?: string[];
};

export type FolderMode = 'all' | 'dated' | 'none';

/**
 * A meeting request from the PUBLIC request page (Sean, 2026-08-19) —
 * appended to the owner's store by the anonymous server endpoint, never
 * written by the app's own editors. `status` is 'new' until the owner
 * proposes a different time ('proposed'); accept and decline both END the
 * record (an event is born / a tombstone is planted), so neither is a
 * status.
 */
export type MeetReq = {
  name: string;
  email: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM' 24-hour start; the meeting is ~1 hour by contract
  status?: 'new' | 'proposed';
};

/** A calendar subscribed BY LINK, read-only (Sean, 2026-08-18: "subscribe-by-
 *  link first, i just want read only access to other calendar system"). The
 *  record is only the pointer — url, name, colour, its place in the picker.
 *  The EVENTS are never records: the server proxies the ICS (calsub_fetch)
 *  and core's subOccurrences reads it fresh on the client, so nothing from
 *  someone else's calendar can ever sync back out. */
export type CalSub = { url: string; name: string; color: string; ord: string };

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
  | 'pref'
  | 'share'
  | 'calsub'
  | 'meetreq';

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
  share: Share;
  calsub: CalSub;
  meetreq: MeetReq;
};

/** The suite's shares file as one singleton record (id 'share'): who I name
 *  as partners, and the three opt-in buckets of MY ids they may see. A
 *  partnership exists only while both sides name each other — the server
 *  re-checks that from both stores on every shared read and write. */
export type Share = {
  partners: string[];
  calendars: string[]; // calendar record ids
  folders: string[]; // reminder folder ids
  notefolders: string[]; // note folder ids
  labels?: Record<string, string>; // my display name for a partner (rename never touches the key)
};

export const SHARE_ID = 'share';

export function shareOf(recs: AnyRec[], id: string = SHARE_ID): Share {
  const rec = recs.find((r) => r.id === id && r.type === 'share' && !r.deleted) as Rec<'share'> | undefined;
  const p = rec?.payload;
  return {
    partners: p?.partners ?? [],
    calendars: p?.calendars ?? [],
    folders: p?.folders ?? [],
    notefolders: p?.notefolders ?? [],
    labels: p?.labels ?? {},
  };
}

export type Rec<T extends RecType = RecType> = {
  id: string;
  type: T;
  updated: number; // ms epoch of the last edit — the last-write-wins vote
  deleted?: boolean; // tombstone: synced so every device learns of the delete
  /**
   * This tombstone is a CONVERSION, not a deletion — the record was replaced
   * by one of another kind (manage.ts's convertToNote and friends) rather than
   * thrown away. Only `lastDeleted` reads it, and only so that "Undo last
   * delete" does not offer to resurrect something the user never deleted,
   * which would leave them holding both copies.
   *
   * Deliberately NOT part of content: neither `sameContent` here nor
   * `rec_same` on the server counts it, because it says why a record went, not
   * what it holds, and it never changes after the tombstone is written.
   *
   * It is a TOP-LEVEL field, so the server has to know it: the sync handler
   * rebuilds each record from a fixed list of keys and silently drops anything
   * else, which would have made this work locally and quietly stop working
   * after a round trip. app.php carries it now. Any future record-level field
   * needs the same change — the wire shape is closed up there, unlike payload.
   */
  superseded?: boolean;
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
export type PrefsApp = 'reminders' | 'notes' | 'calendar' | 'habits' | 'suite';

export function prefsId(app: PrefsApp): string {
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
