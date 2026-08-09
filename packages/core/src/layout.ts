/**
 * Balanced line breaking, for the calendar legend.
 *
 * Sean's rule, in his priority order: use as FEW lines as possible; then,
 * for that number of lines, spread the items so none is left stranded —
 * five chips that don't fit on one line come out three and two, never four
 * and one. Items keep their given order, so chips that belong together
 * (one owner's calendars, say) stay together without being told to.
 *
 * Greedy first-fit gives the minimum line count for a fixed order. It does
 * NOT give a good-looking split — greedy is exactly what produces the
 * orphan, because it crams every line full and lets the remainder fall off
 * the end. So the line count comes from greedy and the split comes from a
 * small dynamic program that minimises the sum of squared leftover space,
 * which is what pulls a 4+1 into a 3+2.
 */

/** Total width of items [i, j) laid on one line, gaps included. */
function span(widths: number[], gap: number, i: number, j: number): number {
  let total = 0;
  for (let k = i; k < j; k++) total += widths[k]! + (k > i ? gap : 0);
  return total;
}

/** The fewest lines the items can occupy in order — plain first-fit. */
export function minLines(widths: number[], max: number, gap: number): number {
  const n = widths.length;
  let lines = 0;
  for (let i = 0; i < n; ) {
    let j = i + 1; // a line always takes at least one item, however wide it is
    while (j < n && span(widths, gap, i, j + 1) <= max) j++;
    lines++;
    i = j;
  }
  return lines;
}

/**
 * Split `widths` into contiguous lines: as few as possible, and among the
 * splits with that many lines, the most even. Returns the index ranges.
 */
export function balanceLines(widths: number[], max: number, gap: number): [number, number][] {
  const n = widths.length;
  if (n === 0 || max <= 0) return n === 0 ? [] : [[0, n]];
  const target = minLines(widths, max, gap);
  if (target <= 1) return [[0, n]];

  // The leftover on a line, squared — so one nearly-empty line costs far
  // more than two half-empty ones, which is the whole point.
  const cost = (i: number, j: number): number => {
    const s = span(widths, gap, i, j);
    if (s > max && j - i > 1) return Infinity; // doesn't fit, and could split
    const slack = Math.max(0, max - s);
    return slack * slack;
  };

  // best[i][l] = cheapest way to lay items i.. in exactly l lines.
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(target + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(target + 1).fill(-1));
  best[n]![0] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let l = 1; l <= target; l++) {
      for (let j = i + 1; j <= n; j++) {
        const c = cost(i, j);
        if (c === Infinity) break; // no longer line starting at i can fit either
        const rest = best[j]![l - 1]!;
        if (rest === Infinity) continue;
        // The last line is costed like any other: an orphan on the final
        // line is precisely the thing being avoided.
        // `<=` breaks ties toward the LATER cut, which fills the earlier
        // line first: 3+2 rather than the equally-balanced 2+3, since text
        // that fills as it goes is what a reader expects.
        if (c + rest <= best[i]![l]!) {
          best[i]![l] = c + rest;
          cut[i]![l] = j;
        }
      }
    }
  }

  const out: [number, number][] = [];
  let i = 0;
  for (let l = target; l > 0; l--) {
    const j = cut[i]![l]!;
    if (j < 0) return [[0, n]]; // unreachable in practice; never crash a render
    out.push([i, j]);
    i = j;
  }
  return out;
}

/**
 * Kind-aware line breaking, for the legend when it wraps.
 *
 * Sean's choice, asked directly: chips that fit on ONE line stay on one
 * line, whatever their kinds — the split is only meaningful when a split
 * must happen, and then it lands on the kind boundaries (all the reminder
 * folders together, all the calendars together), each kind balancing
 * internally if it alone still overflows. `groups` names each item's kind
 * as a number; items of a group are assumed contiguous, which is how
 * monthLegend already orders them.
 */
export function groupedLines(
  widths: number[],
  max: number,
  gap: number,
  groups: number[],
): [number, number][] {
  const n = widths.length;
  if (n === 0) return [];
  if (span(widths, gap, 0, n) <= max || max <= 0) return [[0, n]];
  const out: [number, number][] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && groups[j] === groups[i]) j++;
    for (const [a, b] of balanceLines(widths.slice(i, j), max, gap)) out.push([i + a, i + b]);
    i = j;
  }
  return out;
}
