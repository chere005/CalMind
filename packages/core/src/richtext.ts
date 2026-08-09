/**
 * The note body's marker text, read back as styled runs — the render half of
 * the toolbar's conventions (**bold**, *italic*, __underline__, and the line
 * prefixes '> ' for a quote, '- ' for a bullet, and a leading '1. ' for a
 * numbered step). Markers TOGGLE: an
 * unclosed one styles the rest of its line, which keeps parsing deterministic
 * while someone is mid-typing. Toggles never cross a line break.
 */

export type RichRun = { text: string; bold?: boolean; italic?: boolean; under?: boolean };
export type RichLine = { kind: 'plain' | 'quote' | 'bullet' | 'number'; num?: string; runs: RichRun[] };

/**
 * Two digits at most, and a space after the dot. A recipe step is '1. ' or
 * '12. '; a sentence that opens '1996. What a year' is prose, and '1.5 cups'
 * is a quantity. Unlike the bullet, this marker is NOT written by the toolbar
 * — recipes emit it — so it is read back but never toggled.
 */
const NUMBERED = /^(\d{1,2})[.)] /;

export function richLines(body: string): RichLine[] {
  return body.split('\n').map((raw) => {
    let kind: RichLine['kind'] = 'plain';
    let num: string | undefined;
    let line = raw;
    const numbered = NUMBERED.exec(line);
    if (line.startsWith('> ')) {
      kind = 'quote';
      line = line.slice(2);
    } else if (line.startsWith('- ')) {
      kind = 'bullet';
      line = line.slice(2);
    } else if (numbered) {
      kind = 'number';
      num = numbered[1] + '.';
      line = line.slice(numbered[0].length);
    }
    const runs: RichRun[] = [];
    let bold = false;
    let italic = false;
    let under = false;
    let buf = '';
    const flush = () => {
      if (buf !== '') runs.push({ text: buf, ...(bold && { bold: true }), ...(italic && { italic: true }), ...(under && { under: true }) });
      buf = '';
    };
    for (let i = 0; i < line.length; i++) {
      if (line.startsWith('**', i)) {
        flush();
        bold = !bold;
        i++;
      } else if (line.startsWith('__', i)) {
        flush();
        under = !under;
        i++;
      } else if (line[i] === '*') {
        flush();
        italic = !italic;
      } else {
        buf += line[i];
      }
    }
    flush();
    if (runs.length === 0) runs.push({ text: '' });
    return num === undefined ? { kind, runs } : { kind, num, runs };
  });
}
