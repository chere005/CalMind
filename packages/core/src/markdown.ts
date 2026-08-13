/**
 * The reminders list, as markdown — the ⧉ button on the Reminders toolbar.
 *
 * This is a straight lift of what that button already did inline, moved here
 * so it can be tested. The OUTPUT IS UNCHANGED, deliberately: Sean pastes it
 * somewhere, and quietly reformatting his clipboard would be a worse thing to
 * do than leaving it where it was.
 *
 * Worth knowing that it is NOT the suite's format, which is:
 *
 *     ## Section
 *     - [] text (due time)
 *
 * with done rows dropped, empty sections omitted, and no folder headings.
 * Ours carries folders as '##' with sections under them as '###', keeps done
 * rows as '- [x]' when Completed is showing, adds the repeat to the chip, and
 * indents a subtask. Richer, and divergent. Which one Sean actually wants on
 * his clipboard is his call, not something to settle by refactor.
 */
export type MarkdownRow = {
  text: string;
  due?: string | null;
  time?: string | null;
  repeat?: string | null;   // already spoken, e.g. 'every week'
  done?: boolean;
  indent?: number;
};
export type MarkdownSection = { name: string; rows: MarkdownRow[] };
export type MarkdownFolder = { name: string; sections: MarkdownSection[] };

export function remindersMarkdown(folders: MarkdownFolder[], showDone: boolean): string {
  const lines: string[] = [];
  for (const f of folders) {
    lines.push(`## ${f.name}`);
    for (const sec of f.sections) {
      lines.push(`### ${sec.name}`);
      for (const r of sec.rows) {
        if (!showDone && r.done) continue;
        const chip = [r.due, r.time, r.repeat].filter((b): b is string => !!b).join(' · ');
        const pad = (r.indent ?? 0) > 0 ? '  ' : '';
        lines.push(`${pad}- [${r.done ? 'x' : ' '}] ${r.text}${chip ? ` (${chip})` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * A VIEW as markdown — one heading, then its groups, then their lines.
 *
 * Sean, 2026-08-12: Copy as Markdown belongs on every tab, not just
 * Reminders. The calendar's copy is "all events and reminders that appear in
 * that view", which is a different shape from the folders/sections one above:
 * its groups are days or kinds, and an EVENT has no checkbox to tick.
 *
 * So this is deliberately the plainer format — `- line`, with whatever chip
 * the screen already shows appended in brackets. `remindersMarkdown` stays
 * exactly as it was, because its output is what Sean already pastes and
 * quietly reformatting his clipboard is not a thing to do by refactor.
 *
 * Empty groups are dropped; a view with nothing in it is its heading alone,
 * which is more useful on a clipboard than an empty string.
 */
export type MarkdownGroup = { name: string; lines: { text: string; chip?: string | null }[] };

export function viewMarkdown(title: string, groups: MarkdownGroup[]): string {
  const out: string[] = [`## ${title}`];
  for (const g of groups) {
    if (g.lines.length === 0) continue;
    out.push('', `### ${g.name}`);
    for (const l of g.lines) out.push(`- ${l.text}${l.chip ? ` (${l.chip})` : ''}`);
  }
  return out.join('\n');
}
