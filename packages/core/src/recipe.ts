/**
 * Recipe text out of OCR pages, into the note's marker conventions. OCR
 * output is messy — the heuristics stay humble: find an obvious title (a
 * short early line that isn't a sentence), bullet the ingredient block
 * (quantity-shaped lines, or lines under an INGREDIENTS-ish heading), keep
 * numbered steps as their own lines, and join hyphen-broken words.
 */

const HEADING = /^(ingredients?|directions?|instructions?|method|steps?|preparation|prep|for the .{1,40})\s*:?\s*$/i;
const QTY = /^\s*(\d+([./]\d+)?|½|¼|¾|⅓|⅔|⅛)\s*(cups?|cup|tsp|tbsp|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|cloves?|cans?|sticks?|pinch|dash|slices?|bunch|large|small|medium|eggs?)?\b/i;
const STEP = /^\s*(\d+)[.)]\s+/;

export type RecipeResult = { title: string | null; body: string };
export type RecipeParts = { title: string | null; ingredients: string[]; steps: string[]; extra: string[] };

const UNIT_MAP: Record<string, string> = {
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'l', liters: 'l', l: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  cup: 'cup', cups: 'cups', clove: 'clove', cloves: 'cloves', can: 'can', cans: 'cans',
  pinch: 'pinch', dash: 'dash', stick: 'stick', sticks: 'sticks', slice: 'slice', slices: 'slices',
};
const FRACTIONS: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛' };

/** One quantity token, normalised: decimal commas to points, fractions
 *  typographic, a whole-plus-fraction left as the pair it reads as. */
function oneQty(raw: string): string {
  const q = raw.trim().replace(',', '.').replace(/(\d)\s+(\d\/\d)/, (_s, a, f) => `${a} ${FRACTIONS[f] ?? f}`);
  return FRACTIONS[q] ?? q;
}

// A quantity is a fraction, a decimal, a whole number, or a whole number
// followed by either kind of fraction ('2 1/2', '1 ½'). Longest forms first,
// so '2 1/2 cups' can't be read as a bare 2 with '1/2' left in the name.
const NUM = String.raw`\d+\s+\d\/\d|\d+\s+[½¼¾⅓⅔⅛]|\d\/\d|\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛]`;
// …and a RANGE of two of them, written with a dash or the word 'to'. A range
// is a pattern worth seeing: without it '2-3 cloves garlic' parsed as the
// bare 2 and left '-3 cloves garlic' as the ingredient's name, so the unit
// was never found and the text came back worse than it went in.
const LEAD = new RegExp(`^(${NUM})(?:(\\s*-\\s*|\\s+to\\s+)(${NUM}))?\\s*([a-zA-Z]+)?\\s*(.*)$`);

/** '2tbsp olive oil' → '2 tbsp olive oil'; '1/2 CUP milk' → '½ cup milk';
 *  '2-3 cloves garlic' keeps its range and finds its unit. */
export function parseIngredient(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t === '') return '';
  const m = t.match(LEAD);
  if (!m) return t;
  // A range keeps the separator it was written with — 'to' is the author's
  // word, not ours to rewrite into a dash.
  const qty = m[3]
    ? oneQty(m[1]!) + (/to/.test(m[2]!) ? ' to ' : '-') + oneQty(m[3])
    : oneQty(m[1]!);
  const unitRaw = (m[4] ?? '').toLowerCase();
  const rest = (m[5] ?? '').trim();
  const unit = UNIT_MAP[unitRaw];
  if (unit) return tidy([qty, unit, rest].filter(Boolean).join(' '));
  // Not a known unit: the word belongs to the ingredient itself.
  return tidy([qty, [m[4], rest].filter(Boolean).join(' ').trim()].filter(Boolean).join(' '));
}

/** The pieces are re-joined with spaces, so a rest that began with a comma
 *  ('1 onion, chopped' → word 'onion', rest ', chopped') would come back
 *  holding a space before its punctuation. Close it up. */
const tidy = (s: string) => s.replace(/\s+([,.;:!?)])/g, '$1');

/** The marker body the structured page saves: bold headings, ingredient
 *  bullets, numbered steps — the same shape the reader renders. */
export function recipeBody(ingredients: string[], steps: string[]): string {
  const out: string[] = [];
  if (ingredients.length) {
    out.push('**Ingredients**');
    for (const i of ingredients) out.push('- ' + i);
  }
  if (steps.length) {
    if (out.length) out.push('');
    out.push('**Directions**');
    steps.forEach((s, i) => out.push(`${i + 1}. ${s.replace(/^\s*\d+[.)]\s*/, '')}`));
  }
  return out.join('\n');
}

/**
 * OCR junk never reaches the note: smart quotes and long dashes normalise,
 * bullet glyphs become plain markers, and anything that isn't a letter,
 * number, cooking fraction or ordinary punctuation goes. Imperfect words are
 * fine — the user fixes those — but stray symbol noise is not.
 */
export function scrubLine(raw: string): string {
  return raw
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2022\u25cf\u25aa\u2023\u00b7\u25e6*]/g, ' ')
    .replace(/[^\p{L}\p{N}\s,.:;!?()/&%\u00b0'"\u00bd\u00bc\u00be\u2153\u2154\u215b-]/gu, ' ')
    .replace(/([,.:;!?/-])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatRecipe(pages: string[]): RecipeResult {
  const lines: string[] = [];
  for (const page of pages) {
    for (const raw of page.split('\n')) {
      const l = scrubLine(raw);
      if (l !== '') lines.push(l);
    }
  }
  if (lines.length === 0) return { title: null, body: '' };

  // Join words OCR broke across lines with a trailing hyphen.
  for (let i = 0; i < lines.length - 1; i++) {
    if (/[a-z]-$/.test(lines[i]!)) {
      lines[i] = lines[i]!.slice(0, -1) + lines[i + 1]!;
      lines.splice(i + 1, 1);
      i--;
    }
  }

  // The title: the first of the early lines that reads as a NAME — short,
  // not a quantity, not a heading, no sentence period, not shouting a URL.
  let title: string | null = null;
  let titleAt = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const l = lines[i]!;
    if (l.length >= 4 && l.length <= 60 && !QTY.test(l) && !HEADING.test(l) && !STEP.test(l) &&
        !/[.:;]$/.test(l) && !/https?:|www\./i.test(l) && /[a-zA-Z]/.test(l)) {
      title = l.replace(/\s*\|.*$/, '').trim();
      titleAt = i;
      break;
    }
  }

  const out: string[] = [];
  // Which block the reader is standing in. Plenty of recipe cards NUMBER
  // nothing — a Method heading and then prose, one instruction to a line —
  // and those lines used to fall through as loose text, which meant the
  // structured page showed no instructions at all for them. Under a
  // directions heading a line is a step whether it wears a number or not.
  let block: 'none' | 'ingredients' | 'steps' = 'none';
  let stepNo = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i === titleAt) continue;
    const l = lines[i]!;
    if (HEADING.test(l)) {
      block = /^(ingredients?|for the )/i.test(l) ? 'ingredients' : 'steps';
      if (out.length) out.push('');
      out.push('**' + l.replace(/\s*:\s*$/, '') + '**');
      continue;
    }
    if (STEP.test(l)) {
      // A numbered line ends an ingredient list but does NOT open the steps
      // block: only a heading does that. Otherwise one stray "1." partway
      // down a card turns every remaining line — the note at the bottom
      // about Grandma doubling the butter — into an instruction.
      if (block === 'ingredients') block = 'none';
      // Renumber as they come: OCR skips and repeats numbers, and a step
      // list that reads 1, 3, 3, 7 is worse than no numbers at all.
      out.push(`${++stepNo}. ${l.replace(STEP, '')}`);
      continue;
    }
    if (block === 'steps') {
      out.push(`${++stepNo}. ${l}`);
      continue;
    }
    if (block === 'ingredients' || QTY.test(l)) {
      out.push('- ' + l);
      continue;
    }
    out.push(l);
  }
  return { title, body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/** OCR pages into the structured parts the Add-Recipe page edits. */
export function recipeFromPages(pages: string[]): RecipeParts {
  const flat = formatRecipe(pages);
  const ingredients: string[] = [];
  const steps: string[] = [];
  const extra: string[] = [];
  for (const line of flat.body.split('\n')) {
    const l = line.trim();
    if (l === '' || /^\*\*.*\*\*$/.test(l)) continue;
    if (l.startsWith('- ')) ingredients.push(parseIngredient(l.slice(2)));
    else if (/^\d+[.)]\s/.test(l)) steps.push(l.replace(/^\d+[.)]\s*/, ''));
    else extra.push(l);
  }
  return { title: flat.title, ingredients, steps, extra };
}
