/**
 * The event end time (Sean's ask, 2026-08-18): timePlus is the "+1 hour"
 * presumption, timeRangeLabel is the chip both calendars draw. The weekday
 * and preposition parsing rides in spec/parse.json; what is here is the one
 * seam the spec cannot carry — the date FIELD accepting a weekday too.
 */
import { describe, it, expect } from 'vitest';
import { joinRecipeBody, parseDateField, parseWhenFromText, splitRecipeBody, timeLabel, timePlus, timeRangeLabel } from '../src/index';

describe('timePlus — the presumed end', () => {
  it('adds an hour', () => expect(timePlus('15:00', 60)).toBe('16:00'));
  it('carries minutes', () => expect(timePlus('14:45', 60)).toBe('15:45'));
  it('wraps past midnight and stays a clock reading', () => expect(timePlus('23:30', 60)).toBe('00:30'));
  it('goes backwards too', () => expect(timePlus('00:30', -60)).toBe('23:30'));
});

describe('timeRangeLabel — the chip', () => {
  it('renders the pair with an en dash', () => expect(timeRangeLabel('15:00', '16:30')).toBe('3pm–4:30pm'));
  it('renders the start alone when there is no end', () => expect(timeRangeLabel('15:00', null)).toBe('3pm'));
  it('renders nothing from nothing', () => expect(timeRangeLabel(null, '16:00')).toBe(''));
  it('honours the 24-hour clock on both halves', () => expect(timeRangeLabel('15:00', '16:30', true)).toBe('15:00–16:30'));
  it('agrees with timeLabel on the halves', () => {
    expect(timeRangeLabel('09:15', '10:00')).toBe(`${timeLabel('09:15')}–${timeLabel('10:00')}`);
  });
});

describe('the date field accepts a weekday, like its neighbour', () => {
  // 2026-08-18 is a Tuesday.
  it('full form', () => expect(parseDateField('friday', '2026-08-18')).toBe('2026-08-21'));
  it('short form', () => expect(parseDateField('fri', '2026-08-18')).toBe('2026-08-21'));
  it('today, named', () => expect(parseDateField('tuesday', '2026-08-18')).toBe('2026-08-18'));
});

describe('manual-beats-parsed: the lift switches', () => {
  // 2026-08-18 is a Tuesday; friday is the 21st.
  it('a manual date keeps the day-word in the text, and the time still lifts', () => {
    const [text, d, t] = parseWhenFromText('lunch friday 3pm', '2026-08-18', '09:00', { date: false });
    expect(text).toBe('lunch friday');
    expect(d).toBeNull();
    expect(t).toBe('15:00');
  });
  it('a manual time keeps the clock in the text, and the day still lifts', () => {
    const [text, d, t] = parseWhenFromText('lunch friday 3pm', '2026-08-18', '09:00', { time: false });
    expect(text).toBe('lunch 3pm');
    expect(d).toBe('2026-08-21');
    expect(t).toBeNull();
  });
  it('both manual: the line is left exactly alone', () => {
    const [text, d, t] = parseWhenFromText('lunch friday 3pm', '2026-08-18', '09:00', { date: false, time: false });
    expect(text).toBe('lunch friday 3pm');
    expect(d).toBeNull();
    expect(t).toBeNull();
  });
  it('a lifted time does not imply a day the caller owns', () => {
    // With the date manual, "3pm" must not smuggle in a today/tomorrow.
    const [, d, t] = parseWhenFromText('call 3pm', '2026-08-18', '16:00', { date: false });
    expect(d).toBeNull();
    expect(t).toBe('15:00');
  });
  it('defaults lift both, exactly as before the switches existed', () => {
    const [text, d, t] = parseWhenFromText('lunch friday 3pm', '2026-08-18', '09:00');
    expect(text).toBe('lunch');
    expect(d).toBe('2026-08-21');
    expect(t).toBe('15:00');
  });
});

describe('splitRecipeBody — the blob and its banks', () => {
  const RECIPE = '**Ingredients**\n- 2 cups flour\n- a pinch of salt\n\n**Directions**\n1. Whisk.\n2. Fry.';
  it('a bare marker body is all recipe', () => {
    const s = splitRecipeBody(RECIPE)!;
    expect(s.before).toBe('');
    expect(s.recipe).toBe(RECIPE);
    expect(s.after).toBe('');
  });
  it('prose above and below stays on its own banks', () => {
    const body = `About tonight.\n\n${RECIPE}\n\nGrandma doubled the butter.\n*From http://x*`;
    const s = splitRecipeBody(body)!;
    expect(s.before).toBe('About tonight.');
    expect(s.recipe).toBe(RECIPE);
    expect(s.after).toBe('Grandma doubled the butter.\n*From http://x*');
  });
  it('a note with no marker is not split at all', () => {
    expect(splitRecipeBody('milk\neggs\nbread')).toBeNull();
  });
  it('join is split, undone', () => {
    const body = `above\n\n${RECIPE}\n\nbelow`;
    const s = splitRecipeBody(body)!;
    expect(joinRecipeBody(s.before, s.recipe, s.after)).toBe(body);
  });
  it('a prose line ends the steps — it is the far bank, not step three', () => {
    const s = splitRecipeBody(`${RECIPE}\nServe warm to whoever deserves it.`)!;
    expect(s.recipe).toBe(RECIPE);
    expect(s.after).toBe('Serve warm to whoever deserves it.');
  });
});
