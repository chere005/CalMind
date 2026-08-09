/**
 * The local-first sync engine — the piece that exists exactly once for all three
 * platforms. Transport-agnostic: the app supplies a function that POSTs a
 * SyncRequest and returns the server's SyncResponse; persistence is a snapshot
 * the app stores wherever it likes (AsyncStorage, localStorage).
 *
 * Merging is per-record last-write-wins on `updated`; a tie keeps the incumbent,
 * so replays and echoes of our own pushes are no-ops. The server keeps a per-user
 * sequence number; `cursor` is "I have everything up to seq N", so a pull is only
 * ever the tail.
 */
import type { AnyRec } from './types';

export type SyncRequest = { cursor: number; changes: AnyRec[] };
export type SyncResponse = { cursor: number; changes: AnyRec[]; rejected?: string[] };
export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

export type Snapshot = { cursor: number; recs: AnyRec[]; dirty: string[] };

export class SyncEngine {
  private recs = new Map<string, AnyRec>();
  private dirty = new Map<string, number>(); // id -> updated stamp when marked
  private cursor = 0;
  private rejectedIds = new Set<string>();

  /** Live records, the app's read model. */
  all(): AnyRec[] {
    return [...this.recs.values()].filter((r) => !r.deleted);
  }

  get(id: string): AnyRec | undefined {
    const r = this.recs.get(id);
    return r && !r.deleted ? r : undefined;
  }

  /** A local edit: stamp it, keep it, remember to push it. */
  put(rec: AnyRec, now = Date.now()): AnyRec {
    const stamped = { ...rec, updated: Math.max(now, (this.recs.get(rec.id)?.updated ?? 0) + 1) };
    this.recs.set(rec.id, stamped);
    this.dirty.set(rec.id, stamped.updated);
    return stamped;
  }

  /** A local delete is an edit that plants the tombstone. */
  del(id: string, now = Date.now()): void {
    const r = this.recs.get(id);
    if (r) this.put({ ...r, deleted: true }, now);
  }

  hasPending(): boolean {
    return this.dirty.size > 0;
  }

  /**
   * Ids the server refused on the last round trip — too large, at present.
   * They stay dirty on purpose. A refused record is NOT saved anywhere but
   * this device, and forgetting it would leave the app claiming to be synced
   * while one note existed in exactly one place.
   */
  rejected(): string[] {
    return [...this.rejectedIds];
  }

  /** One round trip: push everything dirty, take the server's tail, advance. */
  async sync(transport: Transport): Promise<void> {
    const sent = new Map(this.dirty);
    const req: SyncRequest = {
      cursor: this.cursor,
      changes: [...sent.keys()].map((id) => this.recs.get(id)!),
    };
    const res = await transport(req);
    for (const theirs of res.changes) {
      const mine = this.recs.get(theirs.id);
      if (!mine || theirs.updated > mine.updated) this.recs.set(theirs.id, theirs);
    }
    this.cursor = res.cursor;
    this.rejectedIds = new Set(res.rejected ?? []);
    // Only forget what we actually sent — an edit made mid-flight stays dirty
    // — and never forget what the server refused, or the record quietly
    // becomes local-only while the app reports everything saved.
    for (const [id, stamp] of sent) {
      if (this.rejectedIds.has(id)) continue;
      if ((this.dirty.get(id) ?? 0) <= stamp) this.dirty.delete(id);
    }
  }

  toSnapshot(): Snapshot {
    return { cursor: this.cursor, recs: [...this.recs.values()], dirty: [...this.dirty.keys()] };
  }

  static fromSnapshot(s: Snapshot | null): SyncEngine {
    const e = new SyncEngine();
    if (!s) return e;
    e.cursor = s.cursor;
    for (const r of s.recs) e.recs.set(r.id, r);
    for (const id of s.dirty) e.dirty.set(id, e.recs.get(id)?.updated ?? 0);
    return e;
  }
}
