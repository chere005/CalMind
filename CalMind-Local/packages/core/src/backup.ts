/**
 * The export file: the whole live store as one JSON document the user can
 * keep ("one button that hands you your whole store as a file" — Sean,
 * 2026-08-19).
 *
 * Tombstones stay OUT. A tombstone keeps its full payload forever (the
 * shared-write scope check needs it — see TODO §3), so a backup that
 * included them would carry every note the user ever deleted, silently, in
 * a file made to be mailed around and left in Downloads. The export is the
 * user's data; deleted things are not their data any more. `superseded`
 * conversions are tombstones and go with them.
 *
 * The output is DETERMINISTIC for a given store: records sort by type then
 * id, keys are written in a fixed order, and the timestamp is the only thing
 * two exports of the same store can differ by — so diffing yesterday's
 * backup against today's shows edits, not shuffle.
 *
 * The records keep their exact sync shape (id, type, updated, payload). No
 * import exists yet; if one ever does, this is already the wire shape the
 * server merges.
 */
import type { AnyRec, RecType } from './types';

export type ExportFile = {
  app: 'calmind';
  format: 1;
  exported: string; // ISO instant of the export itself
  account: string; // whose store this is
  counts: Partial<Record<RecType, number>>; // live records by type, for a human squint
  records: AnyRec[];
};

export function exportStore(recs: AnyRec[], account: string, now: number = Date.now()): ExportFile {
  const live = recs
    .filter((r) => !r.deleted)
    .slice()
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const counts: Partial<Record<RecType, number>> = {};
  for (const r of live) counts[r.type] = (counts[r.type] ?? 0) + 1;
  return {
    app: 'calmind',
    format: 1,
    exported: new Date(now).toISOString(),
    account,
    counts,
    records: live.map((r) => ({ id: r.id, type: r.type, updated: r.updated, payload: r.payload }) as AnyRec),
  };
}

/** Pretty-printed on purpose: the file is insurance someone might READ. */
export function exportText(file: ExportFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

/** calmind-<account>-YYYY-MM-DD.json, both platforms agreeing on the name. */
export function exportFilename(account: string, exported: string): string {
  const day = exported.slice(0, 10);
  const safe = account.replace(/[^A-Za-z0-9_-]/g, '_');
  return `calmind-${safe}-${day}.json`;
}
