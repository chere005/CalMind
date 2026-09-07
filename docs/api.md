# The CalMind sync API

The one HTTP surface every CalMind client talks to. This is the reference; the
[README's "The sync model"](../README.md) is the one-paragraph version, and
[`spec/protocol.json`](../spec/protocol.json) is the machine-checked contract
both the server and every client core assert against — where a value appears in
both places, that file is the source of truth and this page is describing it.

MyCalMind speaks none of this (it has no server); ChefMind speaks all of it,
against these same accounts, kept apart by a sync **space**.

## Shape

One endpoint, one method. Actions are posted in the body rather than mapped to
REST paths, so the whole API is a single file behind any web server with no
rewrite rules.

```
POST <base>/api/index.php
Content-Type: application/json
Authorization: Bearer <64 hex>        # only where the action needs a user

{ "action": "<name>", ... }
```

- **CORS is open** and auth is the bearer token, never a cookie — a foreign
  origin holds nothing. `OPTIONS` → `204`; any non-`POST` → `405`; a body that
  is not JSON → `400`.
- **Every reply is JSON.** Success is `{ "ok": true, ... }`; failure is
  `{ "ok": false, "error": "<message>" }` with a matching HTTP status. Even an
  uncaught throw is turned into that shape, so a client never has to parse raw
  PHP.

`<base>` is the instance:

| Instance | Base |
| --- | --- |
| prod | `https://seancheren.com/CalMind` |
| test | `https://test.seancheren.com/CalMind` |
| dev  | `https://dev.seancheren.com/CalMind` |

Each instance has its own accounts and its own store; a token from one is not
valid at another. Clients pick the base in `apps/app/src/config.ts`.

## Auth

A **bearer token** is 64 hex characters, issued by `signup` and `login`, stored
only as its SHA-256 hash. Send it as `Authorization: Bearer <token>` on every
action that needs a user. `change_password` and `reset` **revoke every token**
the user holds. Passwords are `password_hash()` only — nothing recoverable is
stored.

Five wrong passwords lock an account (`429`), on a lengthening ladder (5m, then
10m, …) that holds against the *right* password too; an unknown username never
locks, because locking it would confirm the name exists.

Passkeys (WebAuthn, hand-rolled — the host has no composer) are the
`passkey_*` actions; a passkey signs in without a username and yields the same
kind of token.

## Actions

| Action | Auth | Purpose |
| --- | --- | --- |
| `signup` | — | Create an account → `{ token, username }`. |
| `login` | — | `{ username, password }` → `{ token, username }`. |
| `logout` | Bearer | Revoke the calling token. |
| `whoami` | Bearer | `{ username }` for the token. |
| `change_password` | Bearer | Set a new password; revokes all tokens. |
| `recover` | — | Email a 6-digit reset code (15 min, 5 tries). |
| `reset` | — | Code + new password; revokes all tokens. |
| `passkey_register_begin` / `_finish` | Bearer | Add a passkey. |
| `passkey_login_begin` / `_finish` | — | Sign in with a passkey → `{ token }`. |
| `passkey_list` / `passkey_remove` | Bearer | Manage passkeys. |
| `sync` | Bearer | The record round-trip — see below. |
| `shared_pull` / `shared_put` | Bearer | Read/write the caller's share record. |
| `spaces` | — | `{ spaces: [...] }` — the sync spaces this server knows. |
| `recipe_fetch` | Bearer | Server-side fetch of a recipe URL (address-guarded). |
| `calsub_fetch` | Bearer | Fetch + cache a subscribed `webcal://`/https calendar. |
| `meetreq_slots` | — | Public open/closed slots for the meeting-request page. |
| `meetreq_create` | — | Book a slot (per-IP throttled). |
| `meetreq_mail` | Bearer | Owner's client mails the booking answer. |
| `meetreq_day` | Bearer | The owner's own day, clashes included. |

`spaces` is public **deliberately**: ChefMind's deploy calls it before it ships,
so a client can never go out in front of an API that would merge its records
into the wrong store.

## Sync

```
POST <base>/api/index.php    Authorization: Bearer <token>
{ "action": "sync", "cursor": N, "changes": [Rec, ...], "space": "chef"? }
  →
{ "ok": true, "cursor": M, "rejected": [id, ...], "changes": [Rec, ...] }
```

- **`cursor`** is a per-user monotonic sequence number. Send the highest you
  have seen; the reply's `changes` is only everything past it (the tail), and
  `M` is the new high-water mark to send next time.
- **`changes`** you send are your locally-dirty records; `changes` you get back
  are everyone-else's edits since your cursor (including your own from another
  device). At most **`MAX_BATCH`** ([`spec/protocol.json`](../spec/protocol.json))
  records per push.
- **`rejected`** lists the ids the server refused (today: a `payload` over
  `MAX_PAYLOAD`). A rejected record stays dirty on the client rather than being
  silently forgotten — the bug that hid was an oversized record dropped while
  the app called itself synced.
- **`space`** omitted is the default CalMind store; `"chef"` is ChefMind's,
  a separate store (`records-chef-<user>.json`) under the same login. Unknown
  space → `400`.

### A record

```
{ "id": "...", "type": "...", "updated": 1723400000, "deleted": true?, "payload": {...} }
```

| Field | Rule |
| --- | --- |
| `id` | Client-minted, matches `REC_ID_RE` ([`spec/protocol.json`](../spec/protocol.json)). |
| `type` | `^[a-z]{1,20}$` — `folder`, `section`, `reminder`, … (new types need no server change). |
| `updated` | Epoch seconds, `> 0`. The merge clock. |
| `deleted` | Present + truthy is a **tombstone** — deletes propagate as records, never as absence. |
| `payload` | Opaque to the server, stored encrypted at rest (`ENC1:` AES). ≤ `MAX_PAYLOAD` (65536) bytes of JSON. |

A malformed row (bad id/type, non-positive `updated`) is dropped so the rest of
the batch still lands; an oversized one is *rejected* (returned in `rejected`).

### Merge

Per-record **last-write-wins on `updated`**. A strictly-newer incoming record
wins. An **equal** `updated` is accepted only when the content actually differs
(the server arbitrates — last edit to arrive wins) and is a no-op when it does
not, so an echo of a record the server already holds never bumps the sequence
and re-broadcasts itself. Order within a list is a fractional `payload.ord` key
**on each record**, never array position — array position cannot survive
per-record merging.

The envelope is clear metadata; the server never reads a `payload`. The E2EE
milestone (client-derived keys, wrapped DEKs, recovery codes) encrypts the
`payload` alone — **the protocol, the server, and the merge rules do not
change**, which is the whole reason they are written down here.

## Where the rules actually live

- **The contract** — record-id shape, max batch: [`spec/protocol.json`](../spec/protocol.json).
  Change a value there and both sides go red.
- **The server** — [`server/lib/app.php`](../server/lib/app.php) behind the thin
  [`server/public/api/index.php`](../server/public/api/index.php).
- **The client** — `packages/core` (the `SyncEngine`) and `apps/app/src/store.tsx`
  (the one stateful seam).

This page is prose *about* those; when it and the code disagree, the code and
`spec/protocol.json` are right.
