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

/**
 * Apply the list behavior for a single newline typed in a note body. The
 * caller supplies the value before and after the native text edit; all other
 * edits return null so normal input, paste, and toolbar formatting are left
 * alone. A handled edit returns the updated body and caret offset.
 */
export function noteListEdit(previous: string, next: string): { text: string; caret: number } | null {
  if (next.length !== previous.length + 1) return null;

  let commonPrefix = 0;
  while (commonPrefix < previous.length && previous[commonPrefix] === next[commonPrefix]) commonPrefix++;
  let commonSuffix = 0;
  while (
    commonSuffix < previous.length
    && previous[previous.length - 1 - commonSuffix] === next[next.length - 1 - commonSuffix]
  ) commonSuffix++;

  // An insertion may only be at an index after the shared prefix and before
  // the shared suffix. Repeated newlines can leave several candidates there;
  // prefer one whose preceding line has a list marker. The scan and marker
  // checks are linear in the edited string, including long notes.
  const firstCandidate = previous.length - commonSuffix;
  const lastCandidate = commonPrefix;
  let insertion = -1;
  let lineStart = -1;
  let markerEnd = -1;
  let currentLineStart = previous.lastIndexOf('\n', firstCandidate - 1) + 1;
  for (let i = firstCandidate; i <= lastCandidate; i++) {
    if (i > currentLineStart && previous[i - 1] === '\n') currentLineStart = i;
    if (next[i] !== '\n') continue;

    let end = currentLineStart;
    while (previous[end] === ' ' || previous[end] === '\t') end++;
    if ((previous[end] === '*' || previous[end] === '-') && previous[end + 1] === ' ' && end + 2 <= i) {
      insertion = i;
      lineStart = currentLineStart;
      markerEnd = end + 2;
      break;
    }
  }
  if (insertion < 0) return null;

  const prefixLength = markerEnd - lineStart;
  const nextLineBreak = next.indexOf('\n', insertion + 1);
  const remainder = next.slice(insertion + 1, nextLineBreak < 0 ? next.length : nextLineBreak);
  if (insertion === markerEnd && /^[ \t]*$/.test(remainder)) {
    // Return on an empty item exits the list by removing both the marker and
    // the just-inserted line break, leaving the preceding line break intact.
    return {
      text: next.slice(0, lineStart) + next.slice(lineStart + prefixLength + 1),
      caret: lineStart,
    };
  }

  const continuation = previous.slice(lineStart, markerEnd);
  return {
    text: next.slice(0, insertion + 1) + continuation + next.slice(insertion + 1),
    caret: insertion + 1 + continuation.length,
  };
}

export function richLines(body: string): RichLine[] {
  return body.split('\n').map((raw) => {
    let kind: RichLine['kind'] = 'plain';
    let num: string | undefined;
    let line = raw;
    const numbered = NUMBERED.exec(line);
    if (line.startsWith('> ')) {
      kind = 'quote';
      line = line.slice(2);
    } else if (line.startsWith('* ')) {
      kind = 'bullet';
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
