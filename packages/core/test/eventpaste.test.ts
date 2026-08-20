import { describe, it, expect } from 'vitest';
import { parseWhenFromText } from '../src/parse';
import { eventLine } from '../src/rules';
import type { Event } from '../src/types';

const TODAY = '2026-08-20';
const NOW = '10:00';

const ev = (over: Partial<Event> = {}): Event => ({
  text: 'standup',
  date: '2026-09-03',
  time: null,
  end: null,
  repeat: null,
  calendarId: 'c1',
  ord: 'm',
  ...over,
});

/**
 * `eventLine` — the day panel's Copy on an event row (Sean, 2026-08-20).
 *
 * Same shape as reminderLine, with one deliberate difference that these tests
 * exist to hold still: the END time goes in the line, and the end is the one
 * token parseWhenFromText cannot read back. That trade is argued in rules.ts;
 * what matters here is that the loss is PINNED rather than discovered later,
 * so nobody "fixes" the round trip by quietly dropping the end.
 */
describe('an event written back out as a line', () => {
  it('is its words and its day', () => {
    expect(eventLine(ev(), TODAY)).toBe('standup 9/3');
  });

  it('carries the time range when there is one', () => {
    expect(eventLine(ev({ time: '09:00', end: '10:00' }), TODAY)).toBe('standup 9/3 9am–10am');
  });

  it('a start with no end is just the start', () => {
    expect(eventLine(ev({ time: '09:00' }), TODAY)).toBe('standup 9/3 9am');
  });

  it('spells the year when a bare m/d would land on the wrong one', () => {
    expect(eventLine(ev({ date: '2026-07-04' }), TODAY)).toBe('standup 7/4/26');
  });

  it('shields words the parser would eat, like the reminder line does', () => {
    expect(eventLine(ev({ text: 'launch 8/3 retro' }), TODAY)).toBe('launch \\8/3 retro 9/3');
  });

  it('an untimed event round-trips exactly', () => {
    const p = ev();
    const [text, date] = parseWhenFromText(eventLine(p, TODAY), TODAY, NOW);
    expect(text).toBe('standup');
    expect(date).toBe('2026-09-03');
  });

  it('a START time round-trips too', () => {
    const [text, date, time] = parseWhenFromText(eventLine(ev({ time: '09:00' }), TODAY), TODAY, NOW);
    expect(text).toBe('standup');
    expect(date).toBe('2026-09-03');
    expect(time).toBe('09:00');
  });

  it('but the END does not, and this is the pinned cost', () => {
    // No range token exists in the parser: TIME_RE matches ONE time. So a
    // pasted range leaves its tail in the title. Recorded deliberately —
    // teaching the parser ranges is the fix, and it is Sean's call.
    const line = eventLine(ev({ time: '09:00', end: '10:00' }), TODAY);
    const [text, date, time] = parseWhenFromText(line, TODAY, NOW);
    expect(date).toBe('2026-09-03');
    expect(time).toBe('09:00');
    expect(text, 'the end time is left behind in the words').toBe('standup –10am');
  });
});
