import { describe, it, expect } from 'vitest';
import { parseWhenFromText } from '../src/parse';
import { editReminderLine } from '../src/rules';
import type { Reminder } from '../src/types';

const TODAY = '2026-08-20';
const NOW = '10:00';

/**
 * The \-escape (Sean, 2026-08-20: "anything can always be escaped with a \
 * to not be caught in the parser like \2pm would be a literal string 2pm")
 * and the returned inline edit's merge rule. Both live in CORE — the escape
 * inside parseWhenFromText itself, the one door every line field goes
 * through, so no screen handles a backslash and none can forget to.
 */
describe('the backslash escape, in the one parser every field uses', () => {
  it('an escaped time is a literal word, not a schedule', () => {
    const [text, d, t] = parseWhenFromText('gym \\2pm', TODAY, NOW);
    expect(text).toBe('gym 2pm');
    expect(d).toBeNull();
    expect(t).toBeNull();
  });
  it('an escaped date stays in the title while a real one beside it still lifts', () => {
    const [text, d, t] = parseWhenFromText('flight \\8/3 rebooked 9/4 2pm', TODAY, NOW);
    expect(text).toBe('flight 8/3 rebooked');
    expect(d).toBe('2026-09-04');
    expect(t).toBe('14:00');
  });
  it('escaped relative words are just words', () => {
    const [text, d] = parseWhenFromText('read \\tomorrow by someone', TODAY, NOW);
    expect(text).toBe('read tomorrow by someone');
    expect(d).toBeNull();
  });
  it('a line of nothing but escapes parses to nothing', () => {
    const [text, d, t] = parseWhenFromText('\\8/3 \\2pm', TODAY, NOW);
    expect(text).toBe('8/3 2pm');
    expect(d).toBeNull();
    expect(t).toBeNull();
  });
  it('bare numbers near an escape are untouched — the sentinel leaks nothing', () => {
    const [text, d, t] = parseWhenFromText('buy 2 \\3pm 4 things', TODAY, NOW);
    expect(text).toBe('buy 2 3pm 4 things');
    expect(d).toBeNull();
    expect(t).toBeNull();
  });
  it('a trailing lone backslash is left alone', () => {
    const [text] = parseWhenFromText('odd line \\', TODAY, NOW);
    expect(text).toBe('odd line \\');
  });
});

const rem = (over: Partial<Reminder> = {}): Reminder => ({
  text: 'Vet', due: '2026-08-25', time: '09:00', done: false, repeat: null,
  folderId: 'f', sectionId: 's', indent: 0, ord: 'a', ...over,
});

describe('editReminderLine — retyping a row reads like typing a new one', () => {
  it('typed tokens OVERWRITE the stored date and time', () => {
    const next = editReminderLine(rem(), 'Vet 9/3 2pm', TODAY, NOW);
    expect(next.text).toBe('Vet');
    expect(next.due).toBe('2026-09-03');
    expect(next.time).toBe('14:00');
  });
  it('a token-less rename leaves the date and time alone — the suite\'s own words', () => {
    const next = editReminderLine(rem(), 'Vet — bring the carrier', TODAY, NOW);
    expect(next.text).toBe('Vet — bring the carrier');
    expect(next.due).toBe('2026-08-25');
    expect(next.time).toBe('09:00');
  });
  it('an escaped token is a rename, not a move', () => {
    const next = editReminderLine(rem(), 'Vet \\9/3 paperwork', TODAY, NOW);
    expect(next.text).toBe('Vet 9/3 paperwork');
    expect(next.due).toBe('2026-08-25');
    expect(next.time).toBe('09:00');
  });
  it('a blank retype abandons the edit rather than naming the row nothing', () => {
    expect(editReminderLine(rem(), '   ', TODAY, NOW)).toEqual(rem());
  });
});
