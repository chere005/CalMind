/**
 * A date that CalMind keeps ABOUT a ChefMind recipe.
 *
 * Sean, 2026-09-16: "allow adding dates in CalMind to ChefMind entries…
 * showing up on the calendar is only known to CalMind, and still points to
 * the ChefMind recipe itself when opened from the calendar."
 *
 * So this is a one-way annotation, and the direction is the whole design.
 * The recipes under the hat in Notes are ChefMind's records, read through a
 * read-only model of its space: CalMind has no writer for them and must not
 * grow one — a date written into a recipe's payload would be CalMind editing
 * somebody else's store, and "read-only here" is a decision, not a gap.
 *
 * The date therefore lives in CalMind's OWN notes prefs, keyed by the chef
 * note's id. That buys three things for free:
 *
 *   · it syncs, because prefs are a synced record — so planning Thursday's
 *     dinner on the phone shows up on the Mac;
 *   · ChefMind never sees it, on any device, which is what "only known to
 *     CalMind" means;
 *   · deleting the recipe in ChefMind leaves a dangling key rather than a
 *     broken row, and `chefDatesOn` simply never matches it. `pruneChefDates`
 *     is there for a caller that wants to tidy, but nothing depends on it
 *     having run.
 *
 * Opening one from the calendar is NOT a note editor: the id routes to the
 * Notes tab, which recognises a chef id and renders the recipe reader. That
 * is the existing route a note takes from the day panel, so there is no
 * second door to keep in step.
 */
import type { AnyRec, Rec } from './types';
import { prefsOf, prefsPut } from './manage';

/** The day a recipe is planned for, or null. `YYYY-MM-DD`. */
export function chefDateOf(recs: AnyRec[], noteId: string): string | null {
  return prefsOf(recs, 'notes').chefDates?.[noteId] ?? null;
}

/** Every planned recipe, id → day. */
export function chefDates(recs: AnyRec[]): Record<string, string> {
  return prefsOf(recs, 'notes').chefDates ?? {};
}

/**
 * Plan a recipe for a day, or clear it with `null`.
 *
 * Returns the pref record to put. Clearing DELETES the key rather than
 * storing an empty string: prefs are whole-record last-writer-wins, so a map
 * that only ever grows would carry every recipe anyone had ever dated to
 * every device, forever.
 */
export function setChefDate(recs: AnyRec[], noteId: string, day: string | null): Rec<'pref'> {
  const next = { ...chefDates(recs) };
  if (day === null) delete next[noteId];
  else next[noteId] = day;
  return prefsPut(recs, 'notes', { chefDates: next });
}

/**
 * The recipes planned for a day, in the order ChefMind lists them.
 *
 * `chefRecs` is the read model of ChefMind's space. A key with no live note
 * behind it is skipped rather than drawn as a blank row — see the dangling
 * key note above.
 */
export function chefDatesOn(recs: AnyRec[], chefRecs: AnyRec[], day: string): Rec<'note'>[] {
  const dates = chefDates(recs);
  return chefRecs.filter(
    (r): r is Rec<'note'> => r.type === 'note' && !r.deleted && dates[r.id] === day,
  );
}

/** Every day that has at least one recipe planned on it. */
export function chefDatedDays(recs: AnyRec[], chefRecs: AnyRec[]): Set<string> {
  const live = new Set(chefRecs.filter((r) => r.type === 'note' && !r.deleted).map((r) => r.id));
  const out = new Set<string>();
  for (const [id, day] of Object.entries(chefDates(recs))) if (live.has(id)) out.add(day);
  return out;
}

/** Drop keys whose recipe is gone. Optional tidying; nothing depends on it. */
export function pruneChefDates(recs: AnyRec[], chefRecs: AnyRec[]): Rec<'pref'> | null {
  const dates = chefDates(recs);
  const live = new Set(chefRecs.filter((r) => r.type === 'note' && !r.deleted).map((r) => r.id));
  const next = Object.fromEntries(Object.entries(dates).filter(([id]) => live.has(id)));
  if (Object.keys(next).length === Object.keys(dates).length) return null;
  return prefsPut(recs, 'notes', { chefDates: next });
}
