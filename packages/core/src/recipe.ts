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

export function formatRecipe(pages: string[]): RecipeResult {
  const lines: string[] = [];
  for (const page of pages) {
    for (const raw of page.split('\n')) {
      const l = raw.replace(/\s+/g, ' ').trim();
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
  let inIngredients = false;
  for (let i = 0; i < lines.length; i++) {
    if (i === titleAt) continue;
    const l = lines[i]!;
    if (HEADING.test(l)) {
      inIngredients = /^ingredients?/i.test(l) || /^for the /i.test(l);
      if (out.length) out.push('');
      out.push('**' + l.replace(/\s*:\s*$/, '') + '**');
      continue;
    }
    if (STEP.test(l)) {
      inIngredients = false;
      out.push(l);
      continue;
    }
    if (inIngredients || QTY.test(l)) {
      out.push('- ' + l);
      continue;
    }
    out.push(l);
  }
  return { title, body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}
