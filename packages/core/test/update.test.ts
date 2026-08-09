import { describe, it, expect } from 'vitest';
import { bundleNameFrom, shouldReload } from '../src/update';

const base = { running: 'index-aaa.js', latest: 'index-bbb.js', dirty: 0, typing: false, reloadedThisSession: false, triedTarget: null };

describe('picking up a newer build', () => {
  it('reloads when the server is serving something else', () => {
    expect(shouldReload(base)).toBe(true);
  });

  it('does nothing when the page is already the current one', () => {
    expect(shouldReload({ ...base, latest: 'index-aaa.js' })).toBe(false);
  });

  it('never reloads over work that has not reached the server', () => {
    // The whole risk of this feature in one line: a reload while something is
    // still owed loses what was typed. Waiting costs nothing — the next visit
    // asks again.
    expect(shouldReload({ ...base, dirty: 1 })).toBe(false);
  });

  it('never reloads out from under a half-typed field', () => {
    // `dirty` is not enough on its own. A note body reaches the engine on
    // every keystroke, so it counts — but the text in a new-reminder field,
    // a folder name or a recipe line has not been committed anywhere and
    // would simply go with the page. The check runs when the app is returned
    // to, which is exactly when a field left mid-word is still sitting there.
    expect(shouldReload({ ...base, typing: true })).toBe(false);
  });

  it('reloads at most once in a page life', () => {
    expect(shouldReload({ ...base, reloadedThisSession: true })).toBe(false);
  });

  it('never reloads twice towards the same build, which is the loop', () => {
    // The in-memory flag above is not enough and it took a spec to show it:
    // the reload re-evaluates the module, so the flag resets exactly when it
    // was needed. If the page comes back STILL running the old bundle — the
    // very failure this feature exists to work around — it would decide
    // again and reload for ever. Remembering the build we aimed at, across
    // the reload, is what stops that.
    expect(shouldReload({ ...base, triedTarget: 'index-bbb.js' })).toBe(false);
    // A different build later is a new target and may still be taken.
    expect(shouldReload({ ...base, latest: 'index-ccc.js', triedTarget: 'index-bbb.js' })).toBe(true);
  });

  it('treats not knowing as a reason to do nothing', () => {
    // A failed fetch is null, and null is not evidence of anything.
    expect(shouldReload({ ...base, latest: null })).toBe(false);
    expect(shouldReload({ ...base, running: null })).toBe(false);
    expect(shouldReload({ ...base, running: null, latest: null })).toBe(false);
  });

  it('reads the entry bundle out of a page, not the async chunk beside it', () => {
    const html =
      '<!DOCTYPE html><html><head><title>CalMind</title></head><body>' +
      '<div id="root"></div>' +
      '<script src="/test/calmind/_expo/static/js/web/index-ea9e9d32d2eee1398118bd418b1ef67d.js" defer></script>' +
      '</body></html>';
    expect(bundleNameFrom(html)).toBe('index-ea9e9d32d2eee1398118bd418b1ef67d.js');
    // Two of them, and the entry is the one the page loads first. Picking the
    // other is a mistake this project has already made once, in a shell
    // one-liner that globbed the directory instead of reading the page.
    const two = html.replace('</body>', '<script src="/x/_expo/static/js/web/index-0000000000000000000000000000ffff.js"></script></body>');
    expect(bundleNameFrom(two)).toBe('index-ea9e9d32d2eee1398118bd418b1ef67d.js');
  });

  it('says nothing rather than guessing when there is no bundle to find', () => {
    expect(bundleNameFrom('<html><body>down for maintenance</body></html>')).toBeNull();
    expect(bundleNameFrom('')).toBeNull();
  });
});
