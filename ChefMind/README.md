# ChefMind

CalMind's recipes, with a shopping list, syncing through the same
server on the same account. A CLONE of `apps/app` and `packages/core`, not a
rewrite — see `CLAUDE.md` for the rules that keeps it under.

```
app/            The Expo app, cloned from apps/app.
packages/core/  The brain, cloned — plus shopping.ts, which has no twin.
tools/          The web export's head patch and service worker.
deploy.sh       The one deploy: the web client, to production.
spec/           The behaviour contract, copied so core's suite runs here.
```

## What it is

Three tabs: **Recipes · ⊕ · Shopping**.

- **Recipes** is CalMind's Notes screen, renamed. Only the labels moved — the
  record type is still `note`, the folder's app is still `notes`, and the
  recipe card, the measure badges, the scale row and the photo import are the
  same code CalMind runs. Renaming the data to change a word on screen would be
  a migration for nothing.
- **Edit mode** is a top-bar button, and a long press or a double tap on any
  recipe gets you there too (Sean, 2026-08-21). In it, recipes carry a tick.
- **Shopping** is the list those ticks fill. Pick several recipes, press *Add to
  shopping list*, and their ingredients arrive combined: same thing in the same
  unit added together, everything else left as written. The rule is
  `core/shopping.ts`, tested; unit CONVERSION is deliberately not done, because
  choosing a density for butter is how a shopping list starts inventing numbers.

## What was taken out

| Gone | Because |
|---|---|
| `Calendar`, `Habits` | not this app |
| `Requests`, `Request`, the account badge | the public request page is CalMind's |
| `QuickTick`, `watch.ts`, the watch/widget targets | no watch, no widgets |
| `subs.ts` | calendar subscriptions belong to the calendar |
| the Event card on Add | an event is a calendar thing |
| `Reminders`, and the Reminder card with it | Sean, 2026-08-21: "remove reminders from ChefMind" — a general list is CalMind's job. The `reminder` RECORD stays: the shopping rows are reminder records, and Search finds them under **Shopping** |
| the repeat pill on Add | what is left there makes a recipe, and a recipe does not recur |
| the time field on Add | a time belongs to a reminder |
| core's calendar and habit STARTERS | records that would sync forever and never be drawn |

## Accounts and data

Sean, 2026-08-21: *"we might as well reuse calmind logins"*, and its own store.

Both, exactly:

- **The API is CalMind's** — `https://seancheren.com/calmind/api/index.php`.
  Same users, same tokens, same passkeys. There is no ChefMind server.
- **The store is not.** Every sync sends `space: 'chef'`, and the server keeps
  one record file per user per space: `records-<user>.json` is CalMind's,
  `records-chef-<user>.json` is this one. See `records_file()` in
  `server/lib/app.php`.

The space is a CONSTANT in `app/src/api.ts`, never configurable: a ChefMind
build that could be pointed at CalMind's records would merge two apps' stores
into whichever synced last.

`deploy.sh` **refuses to ship** unless the live API answers the public `spaces`
action naming `chef`. An API that does not know the parameter ignores it, and
then nothing errors while every ChefMind record lands in CalMind's own store —
found weeks later, by a reminders list with recipes in it.

## Running it locally

```
npm install
npm run export:web && node tools/patch-web-html.mjs app/dist/index.html
CALMIND_DATA_DIR=/tmp/chefmind-dev-data php -S 127.0.0.1:8792 ChefMind/e2e-router.php
```

…then http://127.0.0.1:8792/ChefMind/. The router serves this app at /ChefMind
and CalMind's API at /calmind/api, which is the arrangement production has —
one origin, two paths.

## Deploying

```
./ChefMind/deploy.sh --dry-run     # preview
./ChefMind/deploy.sh --yes-prod    # do it
./ChefMind/deploy.sh --verify      # check what is live
```

It writes `/home/public/ChefMind` and nothing else. There is no test instance:
Sean asked for it straight at production, so the gates are the whole rehearsal.
