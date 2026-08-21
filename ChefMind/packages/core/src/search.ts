/**
 * Search across the three record kinds that hold words a person typed —
 * reminders, notes, events (Sean's ask, 2026-08-19: "always searches
 * Reminders, Notes, and Events with best results on top").
 *
 * Relevance is deliberately simple and inspectable: a phrase hit on the
 * thing's own text beats a scattered-words hit, a title beats a body, and
 * ties break by which record was touched last. No stemming, no fuzz — a
 * query that matches nothing states so, which beats guessing.
 */
import type { AnyRec, Rec } from './types';

export type SearchKind = 'reminder' | 'note' | 'event';
export type SearchSort = 'relevance' | 'date' | 'alpha';

export type SearchHit = {
  id: string;
  kind: SearchKind;
  /** What the row shows: the reminder's text, the note's title, the event's text. */
  text: string;
  /** The thing's own day: due, note date, event date. Undated is null. */
  date: string | null;
  /** A done reminder still turns up — a search is where old things are
   *  found — but says so, and the UI dims it. */
  done?: boolean;
  score: number;
};

/** How one field scores against the query. 0 = no match. */
function fieldScore(field: string, query: string, words: string[]): number {
  const f = field.toLowerCase();
  if (f === query) return 100;
  if (f.startsWith(query)) return 80;
  const at = f.indexOf(query);
  if (at > 0 && /[^\p{L}\p{N}]/u.test(f[at - 1]!)) return 60; // phrase at a word boundary
  if (at >= 0) return 40;
  // Every word present, scattered: still a hit, the weakest kind.
  if (words.length > 1 && words.every((w) => f.includes(w))) return 30;
  return 0;
}

export function searchRecords(
  recs: AnyRec[],
  query: string,
  opts: { kinds?: SearchKind[]; sort?: SearchSort; desc?: boolean } = {},
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const words = q.split(/\s+/);
  const kinds = new Set<SearchKind>(opts.kinds?.length ? opts.kinds : ['reminder', 'note', 'event']);
  const sort = opts.sort ?? 'relevance';
  const hits: (SearchHit & { updated: number })[] = [];
  for (const r of recs) {
    if (r.deleted) continue;
    if (r.type === 'reminder' && kinds.has('reminder')) {
      const p = (r as Rec<'reminder'>).payload;
      const score = fieldScore(p.text, q, words);
      if (score > 0) hits.push({ id: r.id, kind: 'reminder', text: p.text, date: p.due, done: p.done || undefined, score, updated: r.updated });
    } else if (r.type === 'note' && kinds.has('note')) {
      const p = (r as Rec<'note'>).payload;
      // The body counts at half weight: a title hit IS the note; a body hit
      // is a note that mentions it.
      const score = Math.max(fieldScore(p.title, q, words), fieldScore(p.body, q, words) * 0.5);
      if (score > 0) hits.push({ id: r.id, kind: 'note', text: p.title, date: p.date, score, updated: r.updated });
    } else if (r.type === 'event' && kinds.has('event')) {
      const p = (r as Rec<'event'>).payload;
      const score = fieldScore(p.text, q, words);
      if (score > 0) hits.push({ id: r.id, kind: 'event', text: p.text, date: p.date, score, updated: r.updated });
    }
  }
  // Base orders: relevance best-first, date earliest-first, alpha A-first.
  // `desc` flips each; ties always break to the freshest edit, and undated
  // rows sink last whichever way the dates run.
  const dir = opts.desc ? -1 : 1;
  hits.sort((a, b) => {
    if (sort === 'relevance') {
      if (a.score !== b.score) return (b.score - a.score) * dir;
      return b.updated - a.updated;
    }
    if (sort === 'date') {
      if (a.date === null && b.date === null) return b.updated - a.updated;
      if (a.date === null) return 1;
      if (b.date === null) return -1;
      return a.date < b.date ? -dir : a.date > b.date ? dir : b.updated - a.updated;
    }
    // Alphabetical, on the whole visible text (Sean: the note's name, or
    // the entire reminder/event is used).
    const at = a.text.toLowerCase();
    const bt = b.text.toLowerCase();
    return at < bt ? -dir : at > bt ? dir : b.updated - a.updated;
  });
  return hits.map(({ updated: _u, ...h }) => h);
}
