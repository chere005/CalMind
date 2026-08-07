/**
 * The synced record model. Sync metadata (id, type, updated, deleted) stays in the
 * clear so the server can merge without reading content; everything the user wrote
 * lives in `payload`, which the server treats as opaque. The later E2EE step
 * encrypts `payload` alone — nothing about the protocol changes.
 *
 * Folders and sections are records with their own ids, and items reference them BY
 * ID — a lesson from the web suite, where name-keyed folders meant every rename had
 * to chase references through five files. Here a rename touches one record.
 */

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/** "Every 2 weeks" is { n: 2, unit: 'week' }; null happens once. */
export type Repeat = { n: number; unit: RepeatUnit };

export type Folder = { name: string; color: string; ord: string };
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

export type RecType = 'folder' | 'section' | 'reminder';
export type PayloadOf = { folder: Folder; section: Section; reminder: Reminder };

export type Rec<T extends RecType = RecType> = {
  id: string;
  type: T;
  updated: number; // ms epoch of the last edit — the last-write-wins vote
  deleted?: boolean; // tombstone: synced so every device learns of the delete
  payload: PayloadOf[T];
};

export type AnyRec = Rec<'folder'> | Rec<'section'> | Rec<'reminder'>;

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
