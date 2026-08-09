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
// The separator may be a dash, the word 'to', or a slash — '200/250 g' is a
// range on a real card. A slash between SINGLE digits is a fraction instead
// ('3/4 cup'), and NUM already claims that shape before this ever sees it.
const LEAD = new RegExp(`^(${NUM})(?:(\\s*-\\s*|\\s+to\\s+|\\s*/\\s*)(${NUM}))?\\s*([a-zA-Z]+)?\\s*(.*)$`);

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
  // Most recipes people type or paste carry no INGREDIENTS heading at all —
  // the quantities just start. Once a run of them has begun, a line with no
  // number in front of it is still almost always an ingredient: "a pinch of
  // salt", "salt and pepper to taste", "zest of one lemon". Those were
  // falling through to the leftovers, so the Recipe page dropped them from
  // the list entirely and left them sitting under "Include notes".
  let sawQty = false;
  // …but the closing line of a card is prose, and prose must not be dragged
  // in with them. A trailing sentence gives itself away: it runs long, or it
  // ends in a full stop. Humble, like the rest of these heuristics.
  const readsLikeIngredient = (l: string) => l.length <= 40 && !/[.!?]$/.test(l);
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
      sawQty = true;
      out.push('- ' + l);
      continue;
    }
    if (sawQty && readsLikeIngredient(l)) {
      out.push('- ' + l);
      continue;
    }
    out.push(l);
  }
  return { title, body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/** The marker shape recipeBody writes. Anything carrying these headings is
 *  OUR OWN output being read back, not a photograph. */
const OURS = /^\*\*(Ingredients|Directions)\*\*$/i;

/**
 * Read back what recipeBody wrote, structurally — no guessing.
 *
 * Re-opening a saved recipe used to run it through the OCR heuristics again,
 * and they mangled it three ways in one pass: the first ingredient qualified
 * as a "title" and was consumed, the second collected a second dash ("- - a
 * pinch of salt"), and the closing personal line landed under DIRECTIONS as
 * another step — eating the very text the Include-notes checkbox exists to
 * protect. Two saves and the ingredients were gone. Editing a recipe twice is
 * the most ordinary thing anyone does with one.
 */
function fromMarkers(text: string): RecipeParts {
  const ingredients: string[] = [];
  const steps: string[] = [];
  const extra: string[] = [];
  let block: 'none' | 'ing' | 'steps' = 'none';
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (l === '') continue;
    const head = l.match(OURS);
    if (head) {
      block = /ingredients/i.test(head[1]!) ? 'ing' : 'steps';
      continue;
    }
    if (block === 'ing' && l.startsWith('- ')) {
      ingredients.push(l.slice(2).trim());
      continue;
    }
    if (block === 'steps' && /^\d+[.)]\s/.test(l)) {
      steps.push(l.replace(/^\d+[.)]\s*/, ''));
      continue;
    }
    // Anything else ends the block: prose after the steps is prose, not step
    // four. The note keeps its own title, so nothing is taken as one here.
    block = 'none';
    extra.push(l);
  }
  return { title: null, ingredients, steps, extra };
}

/** OCR pages into the structured parts the Add-Recipe page edits. */
export function recipeFromPages(pages: string[]): RecipeParts {
  // Ours reads back as ours. Only a photograph gets the heuristics.
  const joined = pages.join('\n');
  if (joined.split('\n').some((l) => OURS.test(l.trim()))) return fromMarkers(joined);
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
  // NOTE for callers: the title line is CONSUMED — it comes back as `title`
  // and is not in `extra`. A caller that doesn't use the title must put the
  // line back, or it is simply gone. RecipeEditor does exactly that.
  return { title: flat.title, ingredients, steps, extra };
}

/* ── Scaling ──────────────────────────────────────────────────────────────
 * Halving or doubling is the one arithmetic a recipe actually asks of you,
 * and it is exactly the arithmetic nobody wants to do holding a phone with
 * one floury hand. It reads quantities only: a line with no number in front
 * of it ('a pinch of salt', 'salt to taste') is returned untouched, because
 * guessing what half a pinch is would be worse than leaving it alone.
 */

const FRACTION_VALUES: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125,
};
// Rendered back to the fractions a kitchen owns measuring cups for.
const NICE: [number, string][] = [
  [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
  [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'],
];
// Abbreviations never take an 's'; 2 tbsp, not 2 tbsps.
const INVARIANT = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'oz', 'lb', 'lbs']);
// Words that count the thing rather than name it. '1 clove garlic' doubled is
// '2 cloves garlic', but '3 egg yolks' doubled is '6 egg yolks' — 'egg' heads
// a compound noun there, and pluralising it gives the tell-tale 'eggs yolks'.
const MEASURE = new Set([
  'cup', 'clove', 'can', 'stick', 'slice', 'pinch', 'dash', 'sprig', 'head',
  'bunch', 'package', 'packet', 'jar', 'bottle', 'tin', 'strip', 'piece',
  'fillet', 'rasher', 'knob', 'handful', 'scoop', 'sheet', 'stalk', 'pint',
  'quart', 'gallon',
]);

function singularOf(word: string): string {
  if (/(?:ch|sh|s|x|z)es$/i.test(word)) return word.slice(0, -2);
  return /s$/i.test(word) && !/ss$/i.test(word) ? word.slice(0, -1) : word;
}

function qtyValue(raw: string): number | null {
  const q = raw.trim().replace(',', '.');
  const whole = /^(\d+)\s+(.+)$/.exec(q);
  if (whole) {
    const rest = qtyValue(whole[2]!);
    return rest === null ? null : Number(whole[1]) + rest;
  }
  if (FRACTION_VALUES[q] !== undefined) return FRACTION_VALUES[q]!;
  const frac = /^(\d+)\/(\d+)$/.exec(q);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return /^\d+(?:\.\d+)?$/.test(q) ? Number(q) : null;
}

function qtyText(v: number): string {
  if (v <= 0) return '0';
  const whole = Math.floor(v + 1e-9);
  const frac = v - whole;
  if (frac < 0.02) return String(whole);
  for (const [value, glyph] of NICE) {
    if (Math.abs(frac - value) < 0.02) return whole === 0 ? glyph : `${whole} ${glyph}`;
  }
  return String(Math.round(v * 100) / 100);
}

/** 'cups' at one, 'cup'; 'egg' at two, 'eggs'. Abbreviations stay put. */
function countWord(word: string, n: number): string {
  if (INVARIANT.has(word.toLowerCase())) return word;
  // Half a cup is a cup, not cups — English pluralises above one, not away
  // from it.
  const plural = n > 1 + 1e-9;
  const isPlural = /(?:ch|sh|s|x|z)es$/i.test(word) || (/s$/i.test(word) && !/ss$/i.test(word));
  if (plural === isPlural) return word;
  if (plural) return /(?:ch|sh|s|x|z)$/i.test(word) ? word + 'es' : word + 's';
  return /(?:ch|sh|s|x|z)es$/i.test(word) ? word.slice(0, -2) : word.slice(0, -1);
}

/** '1 ½ cups flour' doubled is '3 cups flour'; '2-3 cloves' halved is '1-1 ½'. */
export function scaleIngredient(text: string, factor: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(LEAD);
  if (!m) return t;
  const first = qtyValue(m[1]!);
  if (first === null) return t;
  const second = m[3] ? qtyValue(m[3]) : null;
  const unit = m[4] ?? '';
  const rest = m[5] ?? '';
  const scaled = first * factor;
  const qty = m[3] && second !== null
    ? `${qtyText(scaled)}${m[2]}${qtyText(second * factor)}`
    : qtyText(scaled);
  // A range takes its plural from the top of the range: 2-3 cloves, not clove.
  const count = second !== null ? second * factor : scaled;
  // Only recount a word that is doing the counting: a measure word, or the
  // whole name of the thing. 'egg' in '3 egg yolks' is neither.
  const tail = rest.trim();
  const namesTheThing = tail === '' || /^[,;(]/.test(tail);
  const recount = unit !== '' && (MEASURE.has(singularOf(unit).toLowerCase()) || namesTheThing);
  const word = unit === '' ? '' : recount ? countWord(unit, count) : unit;
  return tidy([qty, word, rest].filter((p) => p !== '').join(' ').trim());
}

/**
 * Scales the ingredients of one of OUR bodies and nothing else. The method is
 * left exactly as written — '- bake 20-25 minutes' is a time, not a yield,
 * and doubling it would ruin the dish rather than the arithmetic.
 */
export function scaleRecipeBody(body: string, factor: number): string {
  if (factor === 1) return body;
  let inIngredients = false;
  return body
    .split('\n')
    .map((raw) => {
      const t = raw.trim();
      if (/^\*\*.+\*\*$/.test(t)) {
        inIngredients = /^\*\*ingredients\*\*$/i.test(t);
        return raw;
      }
      if (!inIngredients || !raw.startsWith('- ')) return raw;
      return '- ' + scaleIngredient(raw.slice(2), factor);
    })
    .join('\n');
}
