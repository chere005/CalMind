# What's tested, and where the old suite's tests went

The PHP suite's ~300 tests are the reference. Every one of them maps to exactly
one of four fates here, listed so nothing falls between the lists — the same
bargain as the suite's own TESTING.md: change a behavior, change its test in
the same commit; a thing in neither list is a thing nobody is looking at.

## 1. Ported into `packages/core` (vitest — `npm run test:core`)

The behaviors that were PHP functions are TypeScript functions now, tested
directly instead of through rendered pages:

- **`spec/*.json` replayed verbatim** (`spec.test.ts`, 44 cases): the slash-only
  US-order parser, repeat steps with month/year clamping, window expansion,
  tick rolls, undated-first outline-block sort. The same vectors the Swift and
  Kotlin cores replay — this core is the third replayer.
- **Tick semantics** (`rules.test.ts`): a repeating dated reminder rolls to the
  occurrence strictly after max(due, today) — an overdue repeat jumps past
  today rather than crawling; a roll never sets done; unticking reopens without
  rolling; undated repeats just complete. Section names stay unique per folder,
  case-insensitively, with tombstones freeing names.
- **Shape guarantees** (`normalize.test.ts`): every starter seeds exactly once
  (incl. the rideAlong Calendar folder growing onto pre-flag accounts); every
  folder keeps a section; strays re-home within their own app; events fall to
  the first live calendar, habits to the first live section; a well-formed
  suite is left byte-for-byte alone.
- **The calendar read model** (`day.test.ts`): events in time order; repeats
  expand clamped; today collects overdue + rideAlong riders (a rider is never
  "late", a done reminder does neither); month-cell marks (overdue beats open,
  done only when all are ticked; event colors in first-appearance order).
- **Order keys** (`order.test.ts`): fractional keys stay strictly ordered under
  appends, 200 same-gap squeezes, and 500 random insertions — what lets drag
  order live per-record and survive sync.
- **The sync engine** (`sync.test.ts`): push/ack bookkeeping, two-device
  convergence, tombstone propagation, echo-is-a-no-op, an edit made mid-flight
  stays dirty, snapshots round-trip dirt included.

## 2. Ported into `server/tools/test.php` (real HTTP — `npm run test:server`)

The suite's auth/storage tests translated to the token world:

- Signup validation; login against a hash; **no plaintext password at rest**;
  bearer tokens rejected when absent, garbage, logged out (each token dies
  alone), or superseded (password change/reset revokes every other device).
- Recovery: codes are mailed (logged), single-use, and five wrong tries burn
  the code for good while the password never moves.
- Sync: cursor round-trips and only ever advances; LWW refuses stale writes;
  tombstones sync; malformed rows (traversal ids, bad types) drop without
  taking their batch; a 501-row batch is refused whole; an oversized payload
  drops alone; **users are walls**; records rest ENC1-encrypted with no
  readable content.

## 3. Not applicable in this architecture — retired with reasons

- **CSRF, sessions, POST→redirect→GET, page-render "quiet" sweeps, edit-mode
  echo, instance preambles, `/test/`–`/dev/` isolation**: server-rendered-PHP
  machinery. This server renders nothing and holds no session — auth is a
  bearer token, so the CSRF class of bug has no purchase. (The old repo keeps
  those tests for the old suite.)
- **Sharing, widgets/feed, seeders, themes, bookshelf**: features that don't
  exist here yet. Each arrives with its tests or it doesn't arrive — sharing's
  partner-wall tests are the first thing written when sharing lands.
- **Old deploy.sh rules**: this repo's `server/deploy-test.sh` carries the same
  invariants (no config, no data, no --delete, guarded destinations) — enforced
  by the script's own guard; the old repo's suite now also asserts its deploys
  leave `/test/calmind/` alone.

## 4. By eye, until a browser-driver harness lands

The suite's hardest-won lesson holds here: the harness runs no gestures, and
gestures are where phone bugs live. Currently unverifiable except by hand:
long-press-to-edit, the two-press ×, tab switching, keyboard behavior, the
month grid's tap-vs-scroll, watch pairing, and everything visual (margins, tab
icons, dark theme). A Playwright suite against `expo start --web` is the
planned closer for the web leg; native gestures stay by-eye.

## The run

```sh
npm test            # core (81) + server (15), ~20 seconds
```
