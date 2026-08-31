/**
 * shareSelFor is the ONE resolution rule for per-partner sharing, used by the
 * share window's ticks and mirrored by the server's share_sel — a partner
 * with an entry in `sel` sees exactly that entry, and a partner without one
 * sees the flat lists, which is also every share record written before `sel`
 * existed. If this drifts from server/lib/app.php's share_sel, the ticks the
 * window shows stop being what the server actually enforces.
 */
import { describe, it, expect } from 'vitest';
import { shareOf, shareSelFor, SHARE_ID, type AnyRec, type Share } from '../src/index';

const shareRec = (payload: Partial<Share>): AnyRec =>
  ({ id: SHARE_ID, type: 'share', updated: 1, payload } as AnyRec);

describe('shareSelFor', () => {
  const share = shareOf([
    shareRec({
      partners: ['sam', 'tess'],
      calendars: ['c1'],
      folders: ['f1'],
      notefolders: [],
      sel: { sam: { calendars: [], folders: ['f2'], notefolders: ['n1'] } },
    }),
  ]);

  it('a partner with a sel entry sees exactly that entry', () => {
    expect(shareSelFor(share, 'sam')).toEqual({ calendars: [], folders: ['f2'], notefolders: ['n1'] });
  });

  it('a partner without one falls back to the flat lists', () => {
    expect(shareSelFor(share, 'tess')).toEqual({ calendars: ['c1'], folders: ['f1'], notefolders: [] });
  });

  it('a partner named after an Object.prototype member falls back cleanly', () => {
    // 'constructor' and '__proto__' both pass the server's USERNAME_RE. With
    // no own sel entry the lookup must NOT surface the inherited member —
    // that escapes as a truthy non-ShareSel and crashes every ticks read.
    const s = shareOf([
      shareRec({ partners: ['constructor', '__proto__'], calendars: ['c1'], folders: [], notefolders: [], sel: {} }),
    ]);
    expect(shareSelFor(s, 'constructor')).toEqual({ calendars: ['c1'], folders: [], notefolders: [] });
    expect(shareSelFor(s, '__proto__')).toEqual({ calendars: ['c1'], folders: [], notefolders: [] });
    // And WITH an entry, that entry wins, same as any other name.
    const withEntry = shareOf([
      shareRec({ partners: ['constructor'], calendars: ['c1'], folders: [], notefolders: [],
                 sel: { constructor: { calendars: [], folders: ['f9'], notefolders: [] } } }),
    ]);
    expect(shareSelFor(withEntry, 'constructor')).toEqual({ calendars: [], folders: ['f9'], notefolders: [] });
  });

  it('a pre-sel record (no sel key at all) resolves to the flat lists', () => {
    const legacy = shareOf([shareRec({ partners: ['tess'], calendars: ['c1'], folders: [], notefolders: [] })]);
    expect(legacy.sel).toEqual({});
    expect(shareSelFor(legacy, 'tess')).toEqual({ calendars: ['c1'], folders: [], notefolders: [] });
  });
});
