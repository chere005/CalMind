/**
 * The list order, ported from the Reminders app's sort_by_date and pinned by
 * spec/sort.json. Sorts in outline blocks, not row by row: a top-level reminder
 * carries the subtasks that follow it in stored order. Sorting the flat list tore
 * a family apart the moment the two disagreed — an undated subtask under a dated
 * parent sorted to the head of the section, where it read as a subtask of
 * whatever now sat above it.
 */

type SortableRow = { due?: string | null; indent?: number };

/** Undated first ('' sorts before any date), then by date, stored order as tie. */
export function sortByDate<T extends SortableRow>(rows: T[]): T[] {
  const blocks: { due: string; seq: number; rows: T[] }[] = [];
  for (const r of rows) {
    if (blocks.length && (r.indent ?? 0) > 0) {
      blocks[blocks.length - 1]!.rows.push(r);
    } else {
      blocks.push({ due: r.due ?? '', seq: blocks.length, rows: [r] });
    }
  }
  blocks.sort((a, b) => (a.due !== b.due ? (a.due < b.due ? -1 : 1) : a.seq - b.seq));
  return blocks.flatMap((b) => b.rows);
}
