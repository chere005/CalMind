/**
 * Recipe text out of OCR pages, into the note's marker conventions. OCR
 * output is messy — the heuristics stay humble: find an obvious title (a
 * short early line that isn't a sentence), bullet the ingredient block
 * (quantity-shaped lines, or lines under an INGREDIENTS-ish heading), keep
 * numbered steps as their own lines, and join hyphen-broken words.
 */

import { looksLikeDefaultNoteTitle } from './parse';

/**
 * What a note should be called after a recipe is imported into it (Sean,
 * 2026-08-21: "when getting a recipe from a url or image, try to name the
 * note/recipe after the recipe").
 *
 * The old rule was "only if the note has no title", which almost never fired:
 * a note made with + is born holding `defaultNoteTitle()` — "Aug 18, 2026 at
 * 5:50pm" — so every imported recipe kept the timestamp it happened to be
 * created at, and the name the page or the photo gave was thrown away.
 *
 * A title somebody TYPED still wins. That is the whole line being drawn here:
 * the generated stamp is a placeholder waiting to be replaced, and anything
 * else is a decision already made.
 */
export function importedRecipeTitle(current: string, parsed: string | undefined | null): string {
  const got = (parsed ?? '').trim();
  if (!got) return current;
  const cur = (current ?? '').trim();
  return cur === '' || looksLikeDefaultNoteTitle(cur) ? got : current;
}

const HEADING = /^(ingredients?|directions?|instructions?|method|steps?|preparation|prep|for the .{1,40})\s*:?\s*$/i;
const QTY = /^\s*(\d+([./]\d+)?|½|¼|¾|⅓|⅔|⅛|⅜|⅝|⅞|⅙|⅚)\s*(cups?|cup|tsp|tbsp|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|gal|gallons?|qts?|quarts?|pts?|pints?|cloves?|cans?|sticks?|pinch|dash|slices?|bunch|large|small|medium|eggs?)?\b/i;
const STEP = /^\s*(\d+)[.)]\s+/;

export type RecipeResult = { title: string | null; body: string };
export type RecipeParts = { title: string | null; ingredients: string[]; steps: string[]; extra: string[] };

const UNIT_MAP: Record<string, string> = {
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'l', liters: 'l', l: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  cup: 'cup', cups: 'cups', clove: 'clove', cloves: 'cloves', can: 'can', cans: 'cans',
  // The big US volumes. Missing until 2026-08-22, which showed up the first
  // time a recipe using them was totalled: '½ gal whole milk' and '1 gal whole
  // milk' had no unit between them, so 'gal' stayed part of the NAME and the
  // two combined into "1 ½ gal whole milk". Every recipe that says gallon,
  // quart or pint was parsing a quantity with no measure attached to it.
  gallon: 'gal', gallons: 'gal', gal: 'gal',
  quart: 'qt', quarts: 'qt', qt: 'qt', qts: 'qt',
  pint: 'pt', pints: 'pt', pt: 'pt', pts: 'pt',
  pinch: 'pinch', dash: 'dash', stick: 'stick', sticks: 'sticks', slice: 'slice', slices: 'slices',
};
const FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛',
  // The rest of the glyphs qtyText can EMIT. They were write-only: halving
  // ⅓ cup printed ⅙ (well, 0.17 before that was fixed) and nothing could
  // read it back — found running Sean's Key Lime Pie through the scaler.
  '3/8': '⅜', '5/8': '⅝', '7/8': '⅞', '1/6': '⅙', '5/6': '⅚',
};

/**
 * The units that may claim a fused word's front ('tspsalt'). Longest first
 * so 'tablespoons' beats 'tablespoon'. Single letters are OUT — 'g' would
 * take the front of 'garlic' — and so are can/cans: 'canned' and 'candied'
 * are ordinary recipe words that begin with them.
 */
const UNIT_KEYS_BY_LENGTH = Object.keys(UNIT_MAP)
  .filter((k) => k.length >= 3 && k !== 'can' && k !== 'cans')
  .sort((a, b) => b.length - a.length);

/** One quantity token, normalised: decimal commas to points, fractions
 *  typographic, a whole-plus-fraction left as the pair it reads as. */
function oneQty(raw: string): string {
  const q = raw.trim().replace(',', '.').replace(/(\d)\s+(?:and\s+)?(\d\/\d)/, (_s, a, f) => `${a} ${FRACTIONS[f] ?? f}`);
  return FRACTIONS[q] ?? q;
}

// A quantity is a fraction, a decimal, a whole number, or a whole number
// followed by either kind of fraction ('2 1/2', '1 ½'). Longest forms first,
// so '2 1/2 cups' can't be read as a bare 2 with '1/2' left in the name.
const NUM = String.raw`\d+\s+and\s+\d\/\d|\d+\s+\d\/\d|\d+\s+[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]|\d\/\d|\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞⅙⅚]`;
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
  // 'tspsalt' — OCR fused the unit to its ingredient. The longest known
  // unit that PREFIXES the word takes it, provided enough word remains to
  // name something; 'cupboard' survives because 'board' is a word but this
  // only fires when the line LED with a quantity, and '2 cupboard' is not
  // a thing a recipe says.
  for (const key of UNIT_KEYS_BY_LENGTH) {
    if (unitRaw.startsWith(key) && unitRaw.length - key.length >= 3) {
      return tidy([qty, UNIT_MAP[key], unitRaw.slice(key.length), rest].filter(Boolean).join(' '));
    }
  }
  // Not a known unit: the word belongs to the ingredient itself.
  return tidy([qty, [m[4], rest].filter(Boolean).join(' ').trim()].filter(Boolean).join(' '));
}

/** The pieces are re-joined with spaces, so a rest that began with a comma
 *  ('1 onion, chopped' → word 'onion', rest ', chopped') would come back
 *  holding a space before its punctuation. Close it up. */
const tidy = (s: string) => s.replace(/\s+([,.;:!?)])/g, '$1');

/**
 * The ingredient's measure as DATA — for the row's badge, the way a parsed
 * date wears one on a reminder. Runs on parseIngredient's own output, so
 * the quantity is already normalised and the unit already canonical; a line
 * with no quantity ('a pinch of salt', 'large egg') has no badge, which is
 * the honest rendering of not knowing.
 */
export type IngredientParts = { qty: string | null; unit: string | null; name: string };

export function ingredientParts(text: string): IngredientParts {
  const t = parseIngredient(text);
  const m = t.match(LEAD);
  if (!m) return { qty: null, unit: null, name: t };
  const qty = m[3] ? `${m[1]}${/to/.test(m[2]!) ? ' to ' : '-'}${m[3]}` : m[1]!;
  const word = (m[4] ?? '').toLowerCase();
  // parseIngredient already canonicalised, so a bare lookup is the truth.
  // The unit's own abbreviation dot goes with it: '1 lb. ground lamb' splits
  // as unit 'lb' + rest '. ground lamb', and the badge row was printing
  // '. ground lamb' — seen on Sean's Pastitsio the day the subheaders landed.
  if (UNIT_MAP[word]) return { qty, unit: word, name: (m[5] ?? '').trim().replace(/^\.\s*/, '') };
  // tidy, as parseIngredient does: '4 eggs, beaten' splits into the word
  // 'eggs' and the rest ', beaten', and a plain space-join hands back
  // 'eggs , beaten' — seen the moment the badge left the name on screen.
  return { qty, unit: null, name: tidy([m[4], (m[5] ?? '').trim()].filter(Boolean).join(' ')) };
}

/**
 * A subheader inside the recipe blob — "For the béchamel:", "Prepare the
 * sandwich:" (Sean's ask, 2026-08-19, his Croque Madame the example). The
 * shape is a short line ending in a colon with no quantity in front of it:
 * exactly what a cook writes above a phase of the work. Typing one as an
 * ordinary row on the Recipe page is the whole gesture — no extra control.
 * It lives in the ingredients/steps arrays like any row, so dragging and
 * editing already work on it.
 */
export function isSubheader(line: string): boolean {
  const t = line.trim();
  return t.length >= 2 && t.length <= 60 && /:$/.test(t) && !QTY.test(t) && /\p{L}/u.test(t);
}

/** The marker shape a subheader wears in a saved body: bold, colon kept —
 *  the colon is what tells it apart from the section headings. */
const SUBHEAD_MARKER = /^\*\*(.+:)\*\*$/;

/** The marker body the structured page saves: bold headings, ingredient
 *  bullets, numbered steps — the same shape the reader renders. A subheader
 *  row goes bold with its colon; the step numbers walk past it. */
export function recipeBody(ingredients: string[], steps: string[]): string {
  const out: string[] = [];
  if (ingredients.length) {
    out.push('**Ingredients**');
    for (const i of ingredients) out.push(isSubheader(i) ? '**' + i + '**' : '- ' + i);
  }
  if (steps.length) {
    if (out.length) out.push('');
    out.push('**Directions**');
    let n = 0;
    for (const st of steps) {
      if (isSubheader(st)) out.push('**' + st + '**');
      else out.push(`${++n}. ${st.replace(/^\s*\d+[.)]\s*/, '')}`);
    }
  }
  return out.join('\n');
}

/**
 * OCR junk never reaches the note: smart quotes and long dashes normalise,
 * bullet glyphs become plain markers, and anything that isn't a letter,
 * number, cooking fraction or ordinary punctuation goes. Imperfect words are
 * fine — the user fixes those — but stray symbol noise is not.
 */
/**
 * A URL is not OCR noise and must come out the other side usable.
 *
 * Two of the rules below are right for a photographed card and wrong for a
 * link: the character filter drops '_', and the de-duplicator collapses
 * repeated punctuation. Between them they turned one of Sean's own source
 * lines — "*From https://…/Pasta_AglioOlioPeperoncino.html*" — into
 * "https:/…/Pasta AglioOlioPeperoncino.html": a dead link, silently, the
 * first time he pressed Recipe on that note. Several of his recipes carry a
 * line like it.
 */
const URL_IN_TEXT = /\bhttps?:\/\/\S+/gi;

export function scrubLine(raw: string): string {
  // Lifted out before scrubbing and put back after. The placeholder is
  // letters and digits only, so the character filter cannot eat it either.
  const urls: string[] = [];
  const masked = raw.replace(URL_IN_TEXT, (u) => {
    // Trailing punctuation belongs to the sentence, not the link: the '*' that
    // closes "*From …*" is emphasis, and a full stop is a full stop. Hand it
    // back to the scrubber, which knows what to do with it.
    const tail = /[*.,;:!?)'"\]]+$/.exec(u);
    const url = tail ? u.slice(0, -tail[0].length) : u;
    urls.push(url);
    return `zzurlz${urls.length - 1}zz${tail ? tail[0] : ''}`;
  });
  const cleaned = masked
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2022\u25cf\u25aa\u2023\u00b7\u25e6*]/g, ' ')
    .replace(/[^\p{L}\p{N}\s,.:;!?()/&%_\u00b0'"\u00bd\u00bc\u00be\u2153\u2154\u215b-]/gu, ' ')
    .replace(/([,.:;!?/-])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.replace(/zzurlz(\d+)zz/g, (_m, i) => urls[Number(i)] ?? '');
}

/**
 * What tesseract actually does to a recipe card, fixed shape by shape. Every
 * rule here chased an observed failure from a real screenshot (2026-08-09,
 * four sites: King Arthur, Budget Bytes, RecipeTin Eats, Sally's) — none of
 * it is predicted. The glyph strips run only where a quantity follows, so a
 * real word keeps its letters.
 */
export function precleanOcrLine(l: string): string {
  return (
    l
      // A checkbox reads as J / TJ / OO / EJ before nearly every ingredient
      // on the checkbox-list sites. Bare J strips always; a pair only when a
      // quantity follows, so 'TO SERVE' keeps its TO.
      .replace(/^J\s+/, '')
      .replace(/^[JOTEDU]{1,2}\s+(?=[\d½¼¾⅓⅔⅛])/, '')
      // A card's own dash bullet: formatRecipe re-bullets what it keeps, so
      // a leading dash here only hides the quantity from every later rule.
      .replace(/^-\s+/, '')
      // '1and 1/2 cups' — the OCR fuses the written-out 'and'.
      .replace(/^(\d)and\s+/, '$1 and ')
      // "11/4tspsalt": a multi-digit run before a fraction is a whole number
      // and a fraction fused — '1 1/4', never eleven quarters.
      .replace(/^(\d)(\d\/\d)/, '$1 $2')
      // "1'teaspoon" — a stray apostrophe where the space was.
      .replace(/(\d)['’](?=[a-zA-Z])/g, '$1 ')
      // Price chatter: '($0.32)' — and its scrubbed ghost '( 0.32)' — is
      // noise on a card; '(with juices, $0.50)' keeps its words only.
      .replace(/\(\s*\$?\s*\d+\.\d{2}\s*\)/g, '')
      .replace(/,\s*\$?\s*\d+\.\d{2}(\s*\))/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Site chrome that OCR walks straight through: ratings, serving widgets,
 *  video overlays. A candidate ingredient that is mostly symbols is the
 *  video-player garbage ('V7, Yi e') by another name. */
export function looksLikeChrome(l: string): boolean {
  if (/^(video|print|save|description|reviews?|notes?|nutrition( information)?|instructions?|equipment|watch on\b.*|cook mode\b.*|tap or hover\b.*|servings?\b.*|prep\b.*|cook\b.*|total\b.*|\d+(\.\d+)?\s+from\s+\d+.*)$/i.test(l)) return true;
  // The ratio test never touches a line that LEADS with a quantity: real
  // ingredients are digit-heavy ('1/2 cup (8 Tbsp; 113g) unsalted' is a
  // third letters by weight) and the garbage never opens with an amount.
  if (QTY.test(l)) return false;
  const alpha = (l.match(/[a-zA-Z]/g) ?? []).length;
  return l.length >= 4 && alpha / l.length < 0.6;
}

export function formatRecipe(pages: string[]): RecipeResult {
  const lines: string[] = [];
  for (const page of pages) {
    for (const raw of page.split('\n')) {
      const l = precleanOcrLine(scrubLine(raw));
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
    // A name comes BEFORE the sections. Merely skipping headings meant the
    // scan walked past "Ingredients", over the quantities, and took the first
    // numberless ingredient as the title — on Sean's Croque Madame that was
    // "fresh cracked black pepper to taste", which then left the list
    // entirely. Once a heading has gone by there is no title left to find.
    if (HEADING.test(l)) break;
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
      const forThe = /^for the /i.test(l);
      // "For the béchamel:" INSIDE a list is a subheader of that list, not a
      // second Ingredients opening — Sean's Croque Madame has one above step
      // 1 (his ask, 2026-08-19). Only at the top, before any list has begun,
      // does a for-the line open the ingredients the old way.
      if (forThe && block !== 'none') {
        out.push('**' + l.replace(/\s*:\s*$/, '') + ':**');
        continue;
      }
      block = /^(ingredients?|for the )/i.test(l) ? 'ingredients' : 'steps';
      if (out.length) out.push('');
      // A for-the heading keeps its colon: that is the subheader shape, and
      // what lets the round trip tell it from **Ingredients** itself.
      out.push('**' + l.replace(/\s*:\s*$/, '') + (forThe ? ':' : '') + '**');
      continue;
    }
    // "Prepare the sandwich:" partway down a list — a short colon line with
    // no quantity subdivides whichever list it is in.
    if (block !== 'none' && isSubheader(l)) {
      out.push('**' + l + '**');
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
    // An explicit "Ingredients" heading used to swallow everything after it,
    // because nothing closed the block but another heading. On a note whose
    // method is plain prose — no METHOD line, just a paragraph — the whole
    // rest of the page became ingredients: the instructions, the word
    // References, and a YouTube link, all bulleted, with no steps at all.
    // A sentence ends the run: full stop and no quantity in front of it.
    // "300 g pasta (spaghetti is traditional…)" keeps its place because it
    // opens with a quantity, and "2 cups flour." because it does too.
    if (block === 'ingredients' && !QTY.test(l) && /[.!?]$/.test(l)) {
      block = 'none';
      sawQty = false;      // …and what follows is prose too, not more of the list
      out.push(l);
      continue;
    }
    if (block === 'ingredients' || QTY.test(l)) {
      // Ratings widgets and video-player garbage sit INSIDE the ingredient
      // region on real pages, so the block test alone waved them through.
      if (looksLikeChrome(l)) { out.push(l); continue; }
      sawQty = true;
      out.push('- ' + l);
      continue;
    }
    if (sawQty && readsLikeIngredient(l) && !looksLikeChrome(l)) {
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
    // A subheader stays in the list it subdivides, as the plain row it was
    // typed as — round-tripping through the editor must not shed it.
    const sub = l.match(SUBHEAD_MARKER);
    if (sub && block !== 'none') {
      (block === 'ing' ? ingredients : steps).push(sub[1]!.trim());
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
  // Which list a subheader belongs to. Bold section headings are consumed
  // (recipeBody writes its own), but a bold COLON line is a subheader and
  // stays — it used to be dropped here with the headings, which silently ate
  // every "For the sauce:" a photograph carried.
  let block: 'ing' | 'steps' = 'ing';
  for (const line of flat.body.split('\n')) {
    const l = line.trim();
    if (l === '') continue;
    const bold = /^\*\*(.*)\*\*$/.exec(l);
    if (bold) {
      const text = bold[1]!.trim();
      if (/:$/.test(text)) (block === 'ing' ? ingredients : steps).push(text);
      else block = /^ingredients?$/i.test(text) ? 'ing' : 'steps';
      continue;
    }
    if (l.startsWith('- ')) {
      const txt = l.slice(2);
      // A narrow column wraps most ingredients onto a second line, and each
      // fragment arrived as its own bullet: '2 cups (250g) all-purpose' /
      // 'flour (spooned and leveled)'. But 'a pinch of salt' is a WHOLE
      // ingredient that also starts lowercase — the spec's own shape — so
      // lowercase alone must not join. A fragment joins when the line above
      // is visibly unfinished: ends on a comma or &, has an unclosed
      // parenthesis, or ends mid-phrase — approximated as NOT ending in one
      // of the pantry nouns a complete line ends with. Capitalised
      // fragments (a wrapped brand name) stay split either way: gluing real
      // neighbours is worse than a split fragment a tap can mend.
      const prev = ingredients[ingredients.length - 1];
      const unclosed = (s: string) => (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;
      const endsComplete = /(salt|pepper|taste|oil|milk|flour|sugar|butter|cream|water|eggs?|cheese|juice|rice|extract|chips?|onion|garlic|soda|vinegar|cinnamon|yogurt|honey|shortening)\)?$/i;
      const continues = prev !== undefined && !QTY.test(txt) &&
        (unclosed(prev) || /^[(]/.test(txt) ||
          (/^[a-z]/.test(txt) && (/[,&;]$/.test(prev) || !endsComplete.test(prev))));
      if (continues) ingredients[ingredients.length - 1] = parseIngredient(`${prev} ${txt}`);
      else ingredients.push(parseIngredient(txt));
    }
    else if (/^\d+[.)]\s/.test(l)) {
      // A numbered line means the steps have begun even with no Directions
      // heading, so a later subheader files with them.
      block = 'steps';
      steps.push(l.replace(/^\d+[.)]\s*/, ''));
    }
    else extra.push(l);
  }
  // NOTE for callers: the title line is CONSUMED — it comes back as `title`
  // and is not in `extra`. A caller that doesn't use the title must put the
  // line back, or it is simply gone. RecipeEditor does exactly that.
  return { title: flat.title, ingredients, steps, extra };
}

/**
 * The marker region as ONE PIECE of the note — for the inset card the
 * rendered note draws and the un-deletable blob the editor shows (Sean,
 * 2026-08-18: "the recipe itself should be a single blob… text can go above
 * or below the blob but it can't be removed itself"). The region runs from
 * the **Ingredients** heading through the last line still wearing the marker
 * shape — bullets under Ingredients, the **Directions** heading, numbered
 * steps — and everything before and after is the note's own prose. null on a
 * note that carries no marker, which is every note the Recipe page never
 * touched.
 */
export function splitRecipeBody(body: string): { before: string; recipe: string; after: string } | null {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^\*\*Ingredients\*\*$/i.test(l.trim()));
  if (start < 0) return null;
  let end = start + 1; // exclusive; blank lines join only if the shape resumes
  let block: 'ing' | 'steps' = 'ing';
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (l === '') continue;
    if (/^\*\*Directions\*\*$/i.test(l)) {
      block = 'steps';
      end = i + 1;
      continue;
    }
    // "**For the béchamel:**" — a subheader belongs to the blob in either
    // block; a plain bold line (someone's own emphasis after the recipe)
    // still ends it.
    if (SUBHEAD_MARKER.test(l)) {
      end = i + 1;
      continue;
    }
    if (block === 'ing' && l.startsWith('- ')) {
      end = i + 1;
      continue;
    }
    if (block === 'steps' && /^\d+[.)]\s/.test(l)) {
      end = i + 1;
      continue;
    }
    break;
  }
  return {
    before: lines.slice(0, start).join('\n').trim(),
    recipe: lines.slice(start, end).join('\n').trim(),
    after: lines.slice(end).join('\n').trim(),
  };
}

/** The split, put back: the shape recipeBody itself writes — blank lines
 *  between the pieces, none doubled, nothing invented. */
export function joinRecipeBody(before: string, recipe: string, after: string): string {
  return [before.trim(), recipe.trim(), after.trim()].filter(Boolean).join('\n\n');
}

/**
 * Whether a note gets the recipe TREATMENT — the inset card, the measure
 * badges, the scale row, the blob editor. The marker shape alone is not the
 * test: Sean's own hand-written notes carry an **Ingredients** heading and
 * bullets from before the recipe feature existed, and the day the card
 * landed they all started rendering as recipes he never made ("i wanted the
 * recipes to be a copy but in proper recipe form" — 2026-08-19). A recipe is
 * a note the Recipe page SAVED, which is the one place `recipe: true` is
 * written. The shape still has to hold too, or a flagged note whose markers
 * were edited away would draw a card around nothing.
 */
export function isRecipeNote(n: { body: string; recipe?: boolean }): boolean {
  return n.recipe === true && splitRecipeBody(n.body) !== null;
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
  '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅙': 1 / 6, '⅚': 5 / 6,
};
// Rendered back to the fractions a kitchen owns measuring cups for. The
// sixths are here because halving a third lands on one: ⅓ cup of melted
// butter halved printed '0.17 cup' on Sean's Key Lime Pie.
const NICE: [number, string][] = [
  [0.125, '⅛'], [1 / 6, '⅙'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
  [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [5 / 6, '⅚'], [0.875, '⅞'],
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
  // Found by running the scaler over ordinary shopping-list shapes rather
  // than by brainstorming: 'loaf' was in the irregular-plural table but not
  // here, so '1 loaf crusty bread' doubled to '2 loaf', and 'rib' was in
  // neither, so '2 ribs celery' doubled to '4 ribs celerys' — the count fell
  // through to the name, which is a mass noun and takes no plural at all.
  'loaf', 'rib', 'bulb', 'wedge', 'sachet', 'tub', 'punnet', 'block', 'bar',
  'drop', 'splash', 'pack',
  // The units people SPELL OUT. These were in UNIT_MAP, which is about
  // normalising 'teaspoons' to 'tsp', and nowhere near this set, which is
  // what decides whether a word gets recounted — so '2 teaspoons mustard'
  // halved to '1 teaspoons' and '2 ounces deli ham' to '1 ounces'. Both off
  // Sean's own cards. The abbreviations stay out: 'g', 'tsp' and 'oz' are
  // INVARIANT and never take an 's' in the first place.
  'teaspoon', 'tablespoon', 'ounce', 'pound', 'gram', 'kilogram',
  'milliliter', 'millilitre', 'liter', 'litre',
]);

/**
 * The plurals English refuses to make by rule. Kitchen words, because that is
 * what turns up: '2 bay leaf' is the tell that a scaler pluralised the word
 * after the number instead of the word that names the thing.
 */
const IRREGULAR: Record<string, string> = {
  leaf: 'leaves', loaf: 'loaves', half: 'halves', knife: 'knives',
  potato: 'potatoes', tomato: 'tomatoes',
};
const SINGULAR_OF: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR).map(([one, many]) => [many, one]),
);

/** 'cloves' → 'clove'. Exported for shopping.ts, which has to treat the two
 *  spellings as one unit or '1 clove garlic' and '3 cloves garlic' stay two
 *  rows — UNIT_MAP canonicalises each plural to ITSELF, deliberately, so the
 *  scaler can print the one the author wrote. */
export function singularOf(word: string): string {
  const low = word.toLowerCase();
  if (SINGULAR_OF[low]) return SINGULAR_OF[low];
  if (/(?:ch|sh|s|x|z)es$/i.test(word)) return word.slice(0, -2);
  return /s$/i.test(word) && !/ss$/i.test(word) ? word.slice(0, -1) : word;
}

export function qtyValue(raw: string): number | null {
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

export function qtyText(v: number): string {
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
export function countWord(word: string, n: number): string {
  const low = word.toLowerCase();
  // Half a cup is a cup, not cups — English pluralises above one, not away
  // from it.
  const plural = n > 1 + 1e-9;
  // 'lbs' is the one abbreviation that arrives already plural-marked, so it
  // alone has somewhere to go: '2 lbs lamb shank' halved read '1 lbs' off
  // Sean's Gohrme Sabzi. The other invariants have no 's' to shed.
  if (low === 'lbs' && !plural) return word.slice(0, -1);
  if (INVARIANT.has(low)) return word;
  const isPlural = SINGULAR_OF[low] !== undefined
    || /(?:ch|sh|s|x|z)es$/i.test(word) || (/s$/i.test(word) && !/ss$/i.test(word));
  if (plural === isPlural) return word;
  if (plural) {
    if (IRREGULAR[low]) return IRREGULAR[low];
    return /(?:ch|sh|s|x|z)$/i.test(word) ? word + 'es' : word + 's';
  }
  if (SINGULAR_OF[low]) return SINGULAR_OF[low];
  return /(?:ch|sh|s|x|z)es$/i.test(word) ? word.slice(0, -2) : word.slice(0, -1);
}

/**
 * A second measure of the SAME amount, written straight after the first —
 * '3 tablespoons 45 g all purpose flour'. Scaling only the leading quantity
 * leaves a line that contradicts itself, which is worse than not scaling at
 * all: six tablespoons is not 45 g, and the cook has no way to tell which
 * number to trust. The second unit must be one we recognise, so '1 cup 2%
 * milk' and '1 tsp 5 spice powder' are left alone.
 *
 * A parenthesised size is a different thing — '1 (14 oz) can tomatoes' means
 * two cans, not one 28 oz can — and never matches here.
 */
const SECOND_MEASURE = new RegExp(`^(${NUM})\\s*([a-zA-Z]+)\\b(.*)$`);

/** '(300 g)' straight after a known unit — the same amount in a second
 *  measure, bracketed. */
const PAREN_DUAL = new RegExp(String.raw`^\(\s*(${NUM})\s*([a-zA-Z]+)\s*\)`);

/** '… or ½ tsp. Morton kosher salt' — an alternative amount of the thing. */
const OR_ALT = new RegExp(String.raw`\bor\s+(${NUM})\s*([a-zA-Z]+)`, 'i');

export function knownUnit(word: string): boolean {
  const w = word.toLowerCase();
  return UNIT_MAP[w] !== undefined || INVARIANT.has(w) || MEASURE.has(singularOf(w));
}

/** A hedge word in front of the number — every shape here is off Sean's own
 *  cards: '~4 Tbsp butter/olive oil' (Pastitsio), 'about 2 cups tomato
 *  sauce' (Pappa col Pomodoro), 'scant 1/4 teaspoon ground nutmeg' (Croque
 *  Madame), 'optional: 1/8 cup sugar' (Key Lime Pie). The hedge rides
 *  along; the number under it still scales, because about 2 cups doubled
 *  is about 4. */
const APPROX = /^(~|about|scant|roughly|around|approx\.?|optional:)\s*/i;

/** '1 ½ cups flour' doubled is '3 cups flour'; '2-3 cloves' halved is '1-1 ½'. */
export function scaleIngredient(text: string, factor: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const pre = APPROX.exec(t);
  if (pre) {
    const rest = t.slice(pre[0].length);
    const scaled = scaleIngredient(rest, factor);
    if (scaled === rest) return t; // no quantity under the hedge — untouched
    return pre[0].trim() === '~' ? '~' + scaled : pre[0].trim() + ' ' + scaled;
  }
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
  // An 'or' after the word means the word still names the thing — '1 onion
  // or 2 shallots' is an onion with an alternative, and doubling owes it
  // its plural.
  const namesTheThing = tail === '' || /^[,;(]/.test(tail) || /^or\s/i.test(tail);
  // 'lbs' joins the recount so a halving can shed its 's' (countWord's own
  // special case); every other invariant abbreviation recounts to itself.
  const recount = unit !== '' && (MEASURE.has(singularOf(unit).toLowerCase()) || namesTheThing || unit.toLowerCase() === 'lbs');
  const word = unit === '' ? '' : recount ? countWord(unit, count) : unit;

  // If the word after the number was NOT the thing being counted — 'bay' in
  // '1 bay leaf', 'large' in '1 large egg' — then the thing is the noun that
  // follows, and that is what takes the count. Only when it is a single bare
  // word: '600 g fresh tagliatelle (see Pasta all'Uovo)' has no such noun to
  // find, and guessing at one would be worse than leaving it.
  // Only when that word is not a unit AT ALL. 'tbsp' and 'g' are units that
  // simply never take an 's', and treating them as adjectives turned
  // '2-3 tbsp sugar' into 'sugars' — caught by the tests that were already
  // there, which is what they are for.
  let head = rest;
  // Set when the leading number counts ITEMS and the size after it is the
  // size of one of them, so that size must not be scaled. Read with perItem
  // below, which is the same question asked of the 'x' spelling.
  let sizeIsPerItem = false;
  // '1 x 400g tin coconut milk' — the size shields the word doing the
  // counting exactly as a bracket does, and 'x' has to be asked about first
  // because it is not a unit, so the general branch below would claim it and
  // then find nothing single-word to count.
  if (unit.toLowerCase() === 'x') {
    const per = /^([\d.,/]+\s*[a-zA-Z]+\s+)([A-Za-z]+)\b/.exec(rest);
    if (per && MEASURE.has(singularOf(per[2]!).toLowerCase())) {
      head = per[1]! + countWord(per[2]!, count) + rest.slice(per[0].length);
    }
  } else if (unit !== '' && !knownUnit(unit)) {
    const cut = rest.search(/[,;(]/);
    const front = (cut < 0 ? rest : rest.slice(0, cut)).trim();
    // A single bare word is the thing. So is the last of several when the
    // words before it only describe it — '1 medium chopped onion' is off
    // Sean's Pastitsio, and '1 large free range egg', '1 large yellow
    // onion' and '1 finely diced garlic clove' are off his cards too. A
    // participle-only (-ed) test used to stand guard here and stopped at
    // plain adjectives: 'free', 'range' and 'yellow' kept each of those
    // nouns singular through a doubling.
    //
    // What keeps this safe, and why the rule is still not "take the last
    // word": no word on the way to the noun may itself be a measure or a
    // unit. '1 small handful parsley' has 'handful' in that position, so
    // nothing is counted and 'parsley' — which has no plural — is left
    // alone. That guards everything the -ed test did, since a participle
    // is never a measure word.
    const words = front.split(/\s+/);
    const countable =
      /^[A-Za-z]+$/.test(front) ||
      (words.length > 1 &&
        words.every((w) => /^[A-Za-z]+$/.test(w)) &&
        words.slice(0, -1).every((w) => !knownUnit(w)));
    if (countable) {
      const lead = words.slice(0, -1).join(' ');
      const counted = countWord(words[words.length - 1]!, count);
      head = (lead === '' ? '' : lead + ' ') + counted + (cut < 0 ? '' : rest.slice(cut));
    }
  } else if (unit === '') {
    // '1 (14 oz) can tomatoes' — the number is followed by a bracket, so the
    // unit group above matched nothing and the word doing the counting is
    // hiding behind the size. Two of these is two CANS; the tin does not grow.
    // Reaching past one parenthesis finds it. Only a bare word directly after
    // the bracket, for the same reason as above: anything less certain is
    // better left as the author wrote it.
    const par = /^(\([^)]*\)\s*)([A-Za-z]+)\b/.exec(rest);
    // The word has to be one that MEASURES, exactly as in the 'x' case below.
    // Without that guard this reaches for whatever follows any bracket, and
    // Sean's Carbonara opens "This makes enough for 3 (skinny) or 2 (hungry)
    // people." — which doubles to "6 (skinny) ors 2 (hungry) people." It is
    // prose and never reaches the scaler, but being saved by where a line
    // happens to sit is not the same as being right.
    if (par && MEASURE.has(singularOf(par[2]!).toLowerCase())) {
      head = par[1]! + countWord(par[2]!, count) + rest.slice(par[0].length);
    }
    // '1 400g tin chopped tomatoes' — the 'x' line above with the 'x' left
    // out, which is how a tin is usually written down. The size shields the
    // counting word identically, and means the same thing: two of these are
    // two 400g tins, not two 800g ones.
    //
    // Without this the leading 1 AND the 400 both doubled — '2 800 g tin',
    // 1600g of tomatoes for a line that asked for 800. That is the very
    // four-times error the 'x' guard below was written against, reached
    // through the one spelling it does not cover. Of the four ways to write
    // this line, '1 x 400g tin', '1 (400g) tin' and '1 tin' were all right;
    // only the bare one was wrong, which is why it survived.
    //
    // `unit === ''` is what makes it safe to assume: it means no word stands
    // between the count and the size. '3 eggs 200g flour' has one, so it is
    // two separate amounts rather than a count and a size, and both of ITS
    // numbers still scale. The MEASURE test is the same conservatism as the
    // two branches above — without a container word to count, the line is
    // left as the author wrote it.
    const bare = /^([\d.,/]+\s*[a-zA-Z]+\s+)([A-Za-z]+)\b/.exec(rest);
    if (!par && bare && MEASURE.has(singularOf(bare[2]!).toLowerCase())) {
      head = bare[1]! + countWord(bare[2]!, count) + rest.slice(bare[0].length);
      sizeIsPerItem = true;
    }
  }

  let after = head;
  const dual = SECOND_MEASURE.exec(head);
  // '1 x 400g tin coconut milk' is NOT one amount written twice. The 400g is
  // the size of each tin, so doubling the line means two of those tins, not
  // two of a tin twice as big — scaling both gave '2 x 800 g', which is four
  // times what the recipe asked for and reads as though it were right. The
  // leading count is the only thing that moves.
  const perItem = unit.toLowerCase() === 'x' || sizeIsPerItem;
  if (dual && !perItem && knownUnit(dual[2]!)) {
    const v = qtyValue(dual[1]!);
    if (v !== null) {
      const scaledDual = v * factor;
      after = [qtyText(scaledDual), countWord(dual[2]!, scaledDual), (dual[3] ?? '').trim()]
        .filter((p) => p !== '')
        .join(' ');
    }
  }
  // '1 ½ cups (300 g) sugar' — with a KNOWN unit in front, the bracket
  // restates the same amount in a second measure and must move with it:
  // doubling gave '3 cups (300 g) sugar' off Sean's Basque cheesecake, a
  // line that contradicts itself. '1 (14 oz) can tomatoes' is the other
  // bracket — no unit in front, the size of each can — and holds still.
  if (unit !== '' && knownUnit(unit)) {
    after = after.replace(PAREN_DUAL, (mm, num: string, u2: string) => {
      const v = qtyValue(num);
      if (v === null || !knownUnit(u2)) return mm;
      return `(${qtyText(v * factor)} ${countWord(u2, v * factor)})`;
    });
  }
  // '1 tsp. Diamond Crystal or ½ tsp. Morton kosher salt' — the OR names an
  // alternative amount of the same thing, and scaling one side only hands
  // the cook a contradiction (also Sean's Basque cheesecake). Only when the
  // word after the number is a unit we know: '1 onion or 2 shallots' counts
  // things, not amounts, and stays as written.
  after = after.replace(OR_ALT, (mm, num: string, u2: string) => {
    const v = qtyValue(num);
    if (v === null || !knownUnit(u2)) return mm;
    return `or ${qtyText(v * factor)} ${countWord(u2, v * factor)}`;
  });
  return tidy([qty, word, after].filter((p) => p !== '').join(' ').trim());
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
        // A subheader ("**For the béchamel:**") subdivides the block it is
        // in rather than ending it — the rows after it still scale.
        if (!SUBHEAD_MARKER.test(t)) inIngredients = /^\*\*ingredients\*\*$/i.test(t);
        return raw;
      }
      if (!inIngredients || !raw.startsWith('- ')) return raw;
      return '- ' + scaleIngredient(raw.slice(2), factor);
    })
    .join('\n');
}

/**
 * A recipe from a web page's own structured data.
 *
 * Nearly every recipe site publishes schema.org/Recipe as JSON-LD, which
 * names the ingredients and the steps EXACTLY — no heuristics, no chatter,
 * no "this reminds me of my grandmother" preamble. That is why this path
 * exists beside the OCR one: when a site says what its recipe is, believe
 * it rather than guessing from pixels.
 *
 * Sean's rule for both paths, verbatim: ingredients and steps ONLY. The
 * description, the notes, the nutrition block and the author's story are
 * deliberately dropped.
 *
 * Takes HTML rather than a URL: fetching belongs to the app (it has the
 * network and the CORS story), parsing belongs here where it can be tested.
 */
export function recipeFromHtml(html: string): RecipeParts | null {
  for (const raw of jsonLdBlocks(html)) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue; // one malformed block must not lose the page
    }
    const node = findRecipeNode(data);
    if (!node) continue;
    const ingredients = asStrings(node.recipeIngredient ?? node.ingredients).map(parseIngredient).filter(Boolean);
    const steps = instructionStrings(node.recipeInstructions);
    if (ingredients.length === 0 && steps.length === 0) continue;
    const title = typeof node.name === 'string' ? decodeEntities(node.name).trim() : null;
    return { title: title || null, ingredients, steps, extra: [] };
  }
  return null;
}

/** Every <script type="application/ld+json"> body on the page. */
function jsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]!.trim());
  return out;
}

type LdNode = Record<string, unknown> & { recipeIngredient?: unknown; ingredients?: unknown; recipeInstructions?: unknown; name?: unknown };

/** The Recipe node, wherever it hides: bare, in @graph, or in an array. */
function findRecipeNode(data: unknown): LdNode | null {
  if (Array.isArray(data)) {
    for (const d of data) {
      const found = findRecipeNode(d);
      if (found) return found;
    }
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const o = data as LdNode;
  const type = o['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe) return o;
  return findRecipeNode(o['@graph']);
}

function asStrings(v: unknown): string[] {
  if (typeof v === 'string') return [decodeEntities(v).trim()].filter(Boolean);
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => (typeof x === 'string' ? [decodeEntities(x).trim()] : [])).filter(Boolean);
}

/**
 * Instructions come three ways in the wild: plain strings, HowToStep objects
 * with a `text`, and HowToSection objects wrapping their own itemListElement.
 * A section's name ("For the sauce") used to be dropped — "a heading is not
 * a step" — but subheaders exist now (Sean, 2026-08-19), so it arrives as
 * one: colon and all, the shape isSubheader knows.
 */
function instructionStrings(v: unknown): string[] {
  if (typeof v === 'string') {
    // Some sites hand over one blob with markup or newlines in it.
    //
    // SPLIT BEFORE DECODING. decodeEntities collapses runs of whitespace —
    // including the newlines this puts in for each tag — so decoding first
    // turned a three-step blob into a single line, silently. The steps were
    // not lost, they were welded together, which is worse: it looks like a
    // recipe with one very long instruction.
    return v
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((l) => decodeEntities(l).trim())
      .filter((l) => l.length > 1);
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (typeof x === 'string') return [decodeEntities(x).trim()];
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    if (o.itemListElement) {
      const inner = instructionStrings(o.itemListElement);
      const name = typeof o.name === 'string' ? decodeEntities(o.name).trim() : '';
      return name !== '' && inner.length ? [name.replace(/:*$/, ':'), ...inner] : inner;
    }
    const t = o.text ?? o.name;
    return typeof t === 'string' ? [decodeEntities(t).trim()] : [];
  }).filter((s) => s.length > 1);
}

/**
 * JSON-LD carries HTML entities through; a fraction must survive them.
 *
 * The named list is deliberately short — the ones a MEASUREMENT meets. Any
 * other named entity ('&eacute;', '&mdash;', '&deg;') is left as written,
 * which is visible but harmless, and a full table is not worth carrying for
 * pages that overwhelmingly serve UTF-8 already.
 *
 * The numeric branch is TOTAL, and that is not tidiness. `String.fromCodePoint`
 * THROWS on anything outside 0..0x10FFFF, and on the NaN that a malformed
 * '&#abc;' parses to — so one bad character anywhere on a fetched page threw a
 * RangeError out of the whole parse. RecipeEditor catches it, which is why the
 * app did not fall over; what Sean got instead was the entire recipe refused
 * with "Invalid code point 1114112" written across the import box. This reads
 * arbitrary pages from a URL somebody typed, so malformed input is the normal
 * case rather than the exception, and an unreadable entity is not worth the
 * recipe. Anything it cannot turn into a character it leaves exactly as it
 * found it.
 *
 * NUL is refused with them: '&#0;' produced a real \0 in the note body, which
 * is not a character anyone typed and makes the record awkward everywhere
 * downstream.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&frac12;/g, '½').replace(/&frac14;/g, '¼').replace(/&frac34;/g, '¾')
    .replace(/&#x?([0-9a-f]+);/gi, (m, code) => {
      const n = parseInt(code, /^&#x/i.test(m) ? 16 : 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/\s+/g, ' ');
}

/* ── First order for a fresh list ─────────────────────────────────────────
 * Sean, 2026-08-19: "always bring unitless ingredients to the bottom of the
 * list, and try to group dry then wet then remaining" — and, minutes later,
 * the boundary: "always respect manual ordering, this is just when things
 * are first added or created." So this runs ONCE, on what an import hands
 * over (a photograph's OCR, a page's JSON-LD), and never on a list a person
 * has since touched — the editor's drags and the saved body are the order.
 */

// The words that class an ingredient, matched against the NAME's last words
// first — the noun that heads '1 cup milk chocolate chips' is 'chips', and
// walking from the end is what keeps the 'milk' in it from calling it wet.
const DRY_WORDS = new Set([
  'flour', 'sugar', 'salt', 'pepper', 'powder', 'soda', 'cocoa', 'oat',
  'oatmeal', 'cornstarch', 'cornflour', 'semolina', 'breadcrumb', 'panko',
  'yeast', 'cinnamon', 'nutmeg', 'paprika', 'cumin', 'turmeric', 'oregano',
  'spice', 'rice', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'lentil',
  'chickpea', 'flake', 'seed', 'sesame', 'almond', 'walnut', 'pecan', 'nut',
  'chip', 'polenta', 'couscous', 'quinoa', 'fenugreek', 'cardamom',
  'coriander', 'saffron',
]);
const WET_WORDS = new Set([
  'water', 'milk', 'buttermilk', 'cream', 'butter', 'margarine', 'oil',
  'egg', 'honey', 'syrup', 'molasses', 'vinegar', 'juice', 'wine', 'beer',
  'stock', 'broth', 'yogurt', 'yoghurt', 'sauce', 'extract', 'vanilla',
  'paste', 'puree', 'ketchup', 'mayonnaise', 'tahini',
]);

/** dry 0 · wet 1 · remaining 2 · unitless 3 — the sort key of one row. */
function ingredientClass(row: string): 0 | 1 | 2 | 3 {
  const p = ingredientParts(row);
  if (p.qty === null) return 3; // 'a pinch of salt', 'salt to taste' sink
  const words = p.name.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = singularOf(words[i]!);
    if (DRY_WORDS.has(w)) return 0;
    if (WET_WORDS.has(w)) return 1;
  }
  return 2;
}

/**
 * A fresh list's first order: dry, wet, the rest, unitless — STABLE within
 * each class, so two cups of flour stay in the order the card gave them.
 * Subheaders fence the sort: each group orders within itself and the
 * headers keep their places.
 */
export function orderIngredients(rows: string[]): string[] {
  const out: string[] = [];
  let seg: { r: string; i: number; c: number }[] = [];
  const flush = () => {
    out.push(...seg.sort((a, b) => a.c - b.c || a.i - b.i).map((x) => x.r));
    seg = [];
  };
  for (const r of rows) {
    if (isSubheader(r)) {
      flush();
      out.push(r);
    } else {
      seg.push({ r, i: seg.length, c: ingredientClass(r) });
    }
  }
  flush();
  return out;
}
