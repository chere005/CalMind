# Images in notes — the blob store design pass

TODO §3 asked for "its own design pass before any of it is written." This is
that pass, 2026-08-19. Nothing here is built; Sean's word starts it.

## Why not a bigger cap (the measured argument, restated from TODO §3)

The client persists the WHOLE snapshot as one JSON string (localStorage on
web, ~5MB an origin, possibly counted in UTF-16 units — halve everything);
the server decrypts, mutates and re-encrypts the WHOLE store per sync. Both
are O(total store) per operation. A 200KB photo base64'd into a record costs
~267KB of snapshot — the room of 187 long recipes — re-serialised on every
save, re-sent on every device, forever. Ten photos is the entire web budget.
Inlining is dead on arrival; nothing below revisits it.

## Shape

Content-addressed blobs OUTSIDE the record set; records hold references.

- **Identity**: `sha256(bytes)`, hex — the id IS the content, so a re-upload
  of the same image is free, integrity is checkable on every read, and there
  is no id-allocation round trip. Encrypt-then-hash on the server side (see
  Encryption) — the id names the PLAINTEXT so two devices computing it agree.
- **Record side**: a note's body carries an image line —
  `![alt](blob:<sha256>)` in the existing markdown dialect, so richLines
  gains one node kind and the record grows by ~80 bytes per image, not by
  the image. Core's job: parse/serialise that line, list a record's blob
  refs (`blobRefs(rec)`), and nothing else — core never sees bytes.
- **Server side**: `data/blobs/<user>/<sha256>`, one file per blob, beside
  the store file rather than inside it. Two new actions in app.php:
  - `blob_put` — multipart or raw body + `X-Blob-Sha` header; server
    verifies the hash before accepting (a mismatch is a 400, never a silent
    rename); enforces a per-blob cap (2MB to start) and a per-user total
    (100MB to start; both constants beside MAX_BATCH so batchlimit-style
    tests can pin them).
  - `blob_get?sha=` — authenticated like everything else; `Cache-Control:
    immutable` since content-addressed bytes cannot change.
  Uploads and downloads are OFF the sync path: sync stays JSON, small, and
  O(records), exactly as today.
- **Client side**: upload at attach time (before the record mutate lands, so
  a synced record never references a blob the server lacks); download
  lazily on first render; cache decoded bytes.
  - **Web cache**: IndexedDB, not localStorage — the 5MB string budget is
    the binding constraint the TODO named, and IndexedDB stores Blobs as
    structured data with a budget in the hundreds of MB. The SNAPSHOT stays
    in localStorage untouched; only image bytes go to IndexedDB. A missing
    cache entry is never an error, just a re-fetch.
  - **Native cache**: expo-file-system, `<cacheDir>/blobs/<sha>` — the OS
    may evict; same re-fetch rule.

## Offline

An image attached offline exists only in the local cache with a queued
upload. The record can sync BEFORE the blob does (the reverse order is
forbidden, the queue is drained before/with each sync): another device
rendering the note shows the alt text and a placeholder until `blob_get`
succeeds. That is the honest behaviour — the same shape as a reminder typed
offline appearing on the other device only after a sync — and it needs the
upload queue persisted (a small JSON list of shas in AsyncStorage; bytes
already sit in the cache).

## Garbage

Unreferenced blobs are collected SERVER-side, lazily: on any sync, with a
cheap threshold (say, at most once a day per user), the server walks the
decrypted records for `blob:<sha>` refs and deletes files not referenced —
BUT only files older than 7 days, so an upload racing its record mutate, or
a record living only in an offline client, is never swept. No client-driven
delete: a client cannot know another device's unsynced references.

## Encryption

The store is ENC1 at rest; blobs get the same treatment or they become the
one plaintext thing on the disk. `blob_put` encrypts with the same key
material before writing; `blob_get` decrypts. The file on disk is named by
the PLAINTEXT hash (computed client-side, verified server-side before
encryption) so identity survives the wrapping. If E2EE envelopes ever land
(TODO §5), blobs ride the same per-container content keys — the
content-addressing survives because the id was always plaintext-derived.

## What this does NOT do (deliberately)

- No thumbnails/resizing pass — first version renders what was attached;
  the per-blob cap keeps the worst case bounded. A resize-at-attach (client
  side, canvas/ImageManipulator to ~1600px) is a cheap follow-up and
  probably wanted before heavy use.
- No progress UI beyond the existing sync dot; an upload in flight holds
  the queue and the dot says syncing.
- No blob types beyond images. The design carries any bytes, but the ask
  was images in notes.

## Order of work, when the word comes

1. Core: `blob:` image node in richLines + `blobRefs` + tests (shape only).
2. Server: blob_put/blob_get + caps + GC + test.php coverage (upload,
   hash-mismatch refusal, cap refusal, GC sweep sparing young/referenced).
3. Client: attach flow (image picker), upload queue, IndexedDB/file cache,
   render with placeholder; e2e for attach→render and offline attach.
4. The widget/watch NEVER fetch blobs (they render text); nothing to do.

Estimated as three sittings, server first so the client always has a real
endpoint to drive.
