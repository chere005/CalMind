/**
 * A shopping list out of chosen recipes.
 *
 * ChefMind only (Sean, 2026-08-21): pick several recipes in the Recipes tab's
 * edit mode and their ingredients become the list. CalMind's core has no twin
 * of this file — it has no shopping tab to feed.
 *
 * THE RULE, and the reason it is a rule rather than a concatenation: a cook
 * shopping for three dinners wants one line that says how much butter, not
 * three lines each saying some. So lines that name the SAME THING in the SAME
 * UNIT are added together; everything else stays as it was written.
 *
 * What is deliberately NOT done is unit conversion. '1 cup butter' and '2 tbsp
 * butter' come out as two lines, because turning one into the other means
 * choosing a density for butter, and a shopping list that quietly invents
 * numbers is worse than one that repeats itself. Two lines about butter is a
 * thing a person reconciles in a second; a wrong single line is not.
 */
import { ingredientParts, isSubheader, countWord, qtyText, qtyValue } from './recipe';

export type ShoppingSource = { title: string | null; ingredients: string[] };

/**
 * One line per thing to buy, in the order first met.
 *
 * Order matters and is the ORDER THE RECIPES WERE PICKED IN, not alphabetical
 * and not regrouped: the list reads as "the first recipe, then what the second
 * one adds", which is how someone checks they chose the right recipes.
 * Reordering is the list's own job once the rows exist — they are draggable
 * like every other row in the app.
 */
export function shoppingLines(sources: ShoppingSource[]): string[] {
  // Insertion-ordered, which is what Map guarantees and a plain object does
  // not for numeric-looking keys.
  const seen = new Map<string, { qty: number | null; unit: string | null; name: string; raw: string }>();
  for (const src of sources) {
    for (const line of src.ingredients) {
      const text = line.trim();
      // A subheader is a heading for the COOK ("For the béchamel:"), not a
      // thing to buy. It carries no quantity by definition — that is what
      // isSubheader tests — so it would otherwise arrive as a bare row
      // telling you to purchase a phase of the work.
      if (text === '' || isSubheader(text)) continue;
      const p = ingredientParts(text);
      const unit = p.unit?.toLowerCase() ?? null;
      const name = p.name.trim();
      // The key is what "the same thing" means. Case-folded, and the unit
      // counts: '2 cups flour' and '2 tbsp flour' are not one line.
      const key = `${unit ?? ''}|${name.toLowerCase()}`;
      // A RANGE ('2-3 cloves') has no single value, so qtyValue answers null
      // and the entry stops combining from then on. That is the honest
      // outcome: '2-3 cloves' plus '4 cloves' has no arithmetic, and inventing
      // one would put a number on the list nobody wrote.
      const qty = p.qty === null ? null : qtyValue(p.qty);
      const prev = seen.get(key);
      if (!prev) {
        seen.set(key, { qty, unit, name, raw: text });
        continue;
      }
      // Two lines that both parse: add them. Anything else keeps the first
      // line exactly as written, which is also what makes a repeated
      // quantity-less ingredient ('salt') collapse to one row.
      if (prev.qty !== null && qty !== null) prev.qty += qty;
    }
  }
  return [...seen.values()].map((e) => render(e));
}

function render(e: { qty: number | null; unit: string | null; name: string; raw: string }): string {
  if (e.qty === null) return e.raw;
  const amount = qtyText(e.qty);
  // countWord is what makes '1 cup' and '2 cups' both right — and the same
  // call the scaler makes, so the two agree about English.
  return e.unit ? `${amount} ${countWord(e.unit, e.qty)} ${e.name}`.trim() : `${amount} ${e.name}`.trim();
}
