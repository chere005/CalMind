import { describe, it, expect } from 'vitest';
import { parseWhenFromText } from '../src/parse';
import { editReminderLine, reminderLine } from '../src/rules';
import type { Reminder } from '../src/types';

const TODAY = '2026-08-20';
const NOW = '10:00';

const rem = (over: Partial<Reminder> = {}): Reminder => ({
  text: 'vet visit',
  due: null,
  time: null,
  done: false,
  repeat: null,
  folderId: 'f1',
  sectionId: 's1',
  indent: 0,
  ord: 'm',
  ...over,
});

/**
 * `reminderLine` — the row's Copy (Sean, 2026-08-20: "add a copy button for
 * reminders in edit mode"). It is `editReminderLine` read backwards, so the
 * property worth pinning is not the exact string but the ROUND TRIP: what
 * Copy puts on the clipboard, pasted into the add field, must be the reminder
 * it came from.
 */
describe('a reminder written back out as a typed line', () => {
  it('a plain reminder is its own words', () => {
    expect(reminderLine(rem(), TODAY)).toBe('vet visit');
  });

  it('carries the date and time as the tokens that made them', () => {
    expect(reminderLine(rem({ due: '2026-09-03', time: '14:00' }), TODAY)).toBe('vet visit 9/3 2pm');
  });

  it('and those tokens parse back into the same reminder', () => {
    const p = rem({ due: '2026-09-03', time: '14:00' });
    const [text, due, time] = parseWhenFromText(reminderLine(p, TODAY), TODAY, NOW);
    expect(text).toBe(p.text);
    expect(due).toBe(p.due);
    expect(time).toBe(p.time);
  });

  it('spells the year when a bare m/d would land on the wrong one', () => {
    // Already gone by: bare "7/4" from Aug 20 means NEXT July, so the year has
    // to be said out loud or the copy quietly moves the reminder a year on.
    const line = reminderLine(rem({ due: '2026-07-04' }), TODAY);
    expect(line).toBe('vet visit 7/4/26');
    expect(parseWhenFromText(line, TODAY, NOW)[1]).toBe('2026-07-04');
  });

  it('and stays bare when bare is right', () => {
    expect(reminderLine(rem({ due: '2026-09-03' }), TODAY)).toBe('vet visit 9/3');
  });

  it('a 24-hour reader still gets a pasteable time', () => {
    // '14:00' is not a token this parser reads. The clipboard carries what can
    // be re-typed; the screen decides what is displayed.
    expect(reminderLine(rem({ time: '09:00', due: '2026-09-03' }), TODAY)).toBe('vet visit 9/3 9am');
  });

  it('re-escapes words the parser would eat, so an escaped title survives', () => {
    // The only way text holds '2pm' is Sean's \-escape on the way in, so the
    // copy puts it back — otherwise pasting rebuilds a DIFFERENT reminder.
    const p = editReminderLine(rem(), 'song \\2pm drop', TODAY, NOW);
    expect(p.text).toBe('song 2pm drop');
    expect(reminderLine(p, TODAY)).toBe('song \\2pm drop');

    const back = editReminderLine(rem(), reminderLine(p, TODAY), TODAY, NOW);
    expect(back.text).toBe(p.text);
    expect(back.due).toBeNull();
    expect(back.time).toBeNull();
  });

  it('shields a literal date and a relative word too', () => {
    expect(reminderLine(rem({ text: 'flight 8/3 rebooked' }), TODAY)).toBe('flight \\8/3 rebooked');
    expect(reminderLine(rem({ text: 'read tomorrow by someone' }), TODAY)).toBe('read \\tomorrow by someone');
  });

  it('leaves ordinary words alone — nothing gets a stray backslash', () => {
    expect(reminderLine(rem({ text: 'buy 5 apples and a card for Bob' }), TODAY))
      .toBe('buy 5 apples and a card for Bob');
  });

  it('a shielded title round-trips WITH a real date beside it', () => {
    const p = rem({ text: 'song 2pm drop', due: '2026-09-04', time: '20:00' });
    const back = editReminderLine(rem(), reminderLine(p, TODAY), TODAY, NOW);
    expect(back.text).toBe('song 2pm drop');
    expect(back.due).toBe('2026-09-04');
    expect(back.time).toBe('20:00');
  });
});
