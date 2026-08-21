import { describe, it, expect } from 'vitest';
import { remindersMarkdown, viewMarkdown } from '../src/markdown';

/**
 * These pin what the ⧉ button ALREADY produced before the logic moved into
 * core — not what the suite produces. The two differ, and the difference is
 * Sean's to settle; the tests exist so the move itself changed nothing.
 */
describe('remindersMarkdown', () => {
  const folders = [{
    name: 'Reminders',
    sections: [
      { name: 'General', rows: [
        { text: 'call the vet', due: '2026-08-10', time: '3:30pm' },
        { text: 'buy milk' },
        { text: 'pick up parcel', indent: 1 },
        { text: 'already done', done: true },
      ] },
      { name: 'Empty', rows: [] },
    ],
  }];

  it('folders are ## and sections are ###', () => {
    const out = remindersMarkdown(folders, false).split('\n');
    expect(out[0]).toBe('## Reminders');
    expect(out[1]).toBe('### General');
  });

  it('the chip joins due, time and repeat with a middle dot', () => {
    expect(remindersMarkdown(folders, false)).toContain('- [ ] call the vet (2026-08-10 · 3:30pm)');
    expect(remindersMarkdown([{ name: 'F', sections: [{ name: 'S', rows: [
      { text: 'water ferns', repeat: 'every week' },
    ] }] }], false)).toContain('- [ ] water ferns (every week)');
  });

  it('a subtask is indented by two spaces', () => {
    expect(remindersMarkdown(folders, false)).toContain('  - [ ] pick up parcel');
  });

  it('done rows follow the Completed toggle, and are ticked when shown', () => {
    expect(remindersMarkdown(folders, false)).not.toContain('already done');
    expect(remindersMarkdown(folders, true)).toContain('- [x] already done');
  });

  it('an empty section still gets its heading — unlike the suite, which drops it', () => {
    // Pinned because it is a real divergence, not because it is obviously
    // right: someone comparing the two later should find it written down.
    expect(remindersMarkdown(folders, false)).toContain('### Empty');
  });
});

describe('viewMarkdown — a tab as markdown', () => {
  it('heads the view, groups what is in it, and drops empty groups', () => {
    const md = viewMarkdown('Wednesday, August 12', [
      { name: 'Events', lines: [{ text: 'standup', chip: '9am' }, { text: 'all day thing' }] },
      { name: 'Nothing here', lines: [] },
      { name: 'Reminders', lines: [{ text: 'ring the vet', chip: 'today' }] },
    ]);
    expect(md).toBe([
      '## Wednesday, August 12',
      '',
      '### Events',
      '- standup (9am)',
      '- all day thing',
      '',
      '### Reminders',
      '- ring the vet (today)',
    ].join('\n'));
  });

  it('an empty view is its heading, not an empty clipboard', () => {
    expect(viewMarkdown('Today', [{ name: 'Events', lines: [] }])).toBe('## Today');
  });
});
