/**
 * Every id core can mint has to satisfy the server's own pattern.
 *
 * `app.php` validates record ids against REC_ID_RE and refuses anything else.
 * A client that minted an id outside it would not get an error worth the
 * name: the record would be refused, stay dirty, and live on one device for
 * ever while the app looked fine. That is the same shape as the batch
 * deadlock next door — a protocol rule the client is trusted to keep and
 * nothing checks.
 *
 * The pattern is READ OUT OF app.php rather than copied here, so this cannot
 * quietly agree with a rule the server has stopped enforcing.
 *
 * Written after a sweep for ids that do NOT conform found two — `~${c.id}`
 * and `~${c.sec.id}` in ItemModal — which turned out to be dropdown option
 * ids rather than record ids, the tilde marking a shared destination. No bug,
 * but close enough to the real thing to be worth a guard: the day someone
 * reaches for that convention when minting a RECORD, this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { newId, tickId, prefsId } from '../src/types';

/**
 * The rule, taken from the CONTRACT — spec/protocol.json, which CoreMind holds
 * canonically and both this repo and ChefMind carry.
 *
 * It used to be read out of server/lib/app.php, and ChefMind's copy of this
 * file had to reach into THIS repo across the filesystem to run at all. The
 * contract is the shared fact now; app.php is held to it below, which is the
 * direction nothing checked before.
 *
 * Resolved from THIS FILE: vitest's cwd differs between a `--root
 * packages/core` run and one from the repo root, and a path that works only
 * one way is a check that silently stops running.
 */
const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../spec/protocol.json', import.meta.url)), 'utf8'),
) as { recIdPattern: string; maxBatch: number };

describe('ids core mints are ids the server will take', () => {
  const re = new RegExp(spec.recIdPattern);

  it('the pattern really was read from the contract', () => {
    // Guards the guard: a regex that matched everything would make every
    // assertion below vacuous.
    expect(re.test('a b c'), 'the pattern should reject a space').toBe(false);
    expect(re.test(''), 'and an empty id').toBe(false);
  });

  it('and THE SERVER still agrees with the contract', () => {
    // The half that only this repo can check, because only this repo has the
    // server. Without it the contract could drift from app.php and every
    // client would go on proving itself against a document the server had
    // stopped honouring.
    const php = readFileSync(
      fileURLToPath(new URL('../../../server/lib/app.php', import.meta.url)), 'utf8');
    const m = /const\s+REC_ID_RE\s*=\s*'\/(.+?)\/'/.exec(php);
    expect(m, 'REC_ID_RE not found in app.php — this check is not running').not.toBeNull();
    expect(m![1], 'app.php and spec/protocol.json disagree about record ids').toBe(spec.recIdPattern);
  });

  it('newId, over 500 draws', () => {
    for (let i = 0; i < 500; i++) {
      const id = newId();
      expect(re.test(id), `newId produced ${JSON.stringify(id)}`).toBe(true);
    }
  });

  it('tickId, whose id is built by joining two things', () => {
    // NOT about the hyphen-stripping, though that was the first guess: the
    // server's class allows '-', so leaving the date's hyphens in still
    // passes — checked by mutation rather than assumed. What this guards is a
    // future separator that is NOT allowed. A colon, a slash or a dot in that
    // template would refuse every habit tick at the server, and the app would
    // show the tick perfectly while it never left the device.
    for (const date of ['2026-08-12', '2026-01-01', '2026-12-31']) {
      const id = tickId(newId(), date);
      expect(re.test(id), `tickId produced ${JSON.stringify(id)}`).toBe(true);
    }
  });

  it('prefsId, for every app that has prefs', () => {
    for (const app of ['reminders', 'notes', 'calendar', 'habits', 'suite'] as const) {
      const id = prefsId(app);
      expect(re.test(id), `prefsId(${app}) produced ${JSON.stringify(id)}`).toBe(true);
    }
  });
});
