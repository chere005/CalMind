# Images in notes: blob storage design

**Status: design only. No blob format, endpoint, or storage bucket is implemented.**

## Why images need a separate store

A phone photo encoded as base64 expands by roughly a third. Putting it in a
note record would make every edit, snapshot, and sync carry the photo again.
The record should carry a small reference; image bytes should travel on a
separate path.

## Record format

An image is a Markdown-like line in a note body:

```text
![alt text](blob:<sha256>)
```

The SHA-256 is over the original image bytes. Core should parse the line as a
rich-text image node and expose the note's blob references. Core must not read
or store image bytes. Existing notes without image nodes keep their current
meaning.

## Server storage on the planned architecture

The server migration plan uses a Cloudflare Worker, D1 for account/auth data,
and one Durable Object per account and space for synced records. Put image
bytes in a **private Cloudflare R2 bucket**, accessed only through an R2
binding in the Worker:

- The Worker authenticates each request and derives the account identity from
  the token. Clients never choose another account's storage prefix.
- Store objects under an account-scoped key such as
  `<account-id>/<sha256>`. This deduplicates repeated uploads within one
  account without exposing whether another account has the same image.
- `blob_put` accepts raw bytes, checks the size and SHA-256, then writes the
  object. `blob_get` streams the object only after authorization. Neither
  operation makes the bucket public or returns a permanent public URL.
- Keep bytes out of sync batches and Durable Object record payloads. Sync
  continues to exchange small JSON records; the note's reference is the only
  part that syncs.
- Set per-image and per-account quotas. Start with a 2 MiB image cap and a
  100 MiB account cap, then validate those limits against phone image sizes
  before shipping.

Cloudflare documents Worker bindings as the in-Worker interface for reading
and writing R2 objects ([Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)).

## Upload, download, and offline behavior

1. The client resizes a selected image to a practical maximum dimension,
   computes its hash, and saves it in its local cache.
2. The client queues the upload. It uploads the bytes before syncing the note
   that references them, so a synced note never points at a blob that has not
   reached the server.
3. If offline, both the image and its queued upload remain local. The note can
   still be edited locally; another device sees the alt text or a placeholder
   until upload succeeds.
4. On first render, a client checks its cache and fetches a missing image
   through the authenticated Worker endpoint. A failed fetch leaves the note
   readable and offers retry.

Use IndexedDB for web bytes and the app's file cache for native bytes. These
caches are disposable: eviction means re-fetch, not loss of the synced image.
The watch and widgets continue to show note text and do not fetch images.

## Authorization, sharing, and cleanup

An account-scoped key is not sufficient authorization by itself. The Worker
must confirm that the caller may read the referenced image. In particular,
shared notes must not give a partner access to unrelated images in the owner's
account. The sharing rule for a blob should follow the same selected-record
permissions as the note that references it.

Keep reference metadata alongside the account's Durable Object store, updated
when note changes are accepted. Garbage collection should delete only objects
with no references and older than a grace period (at least seven days), so an
offline device or an upload racing a note sync does not lose an image. Account
deletion must remove the account's R2 prefix as well as its auth and record
data. Cloudflare R2 lifecycle rules can expire objects by prefix, but they
cannot determine whether a live note still references an image; reference
aware cleanup remains application work ([R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)).

## Encryption and privacy

The current PHP server encrypts its record files at rest with its `ENC1`
wrapper. The Worker migration design has not yet specified an equivalent for
Durable Object or R2 data. This image design must not imply that R2 storage is
end-to-end encrypted. Before implementation, decide whether to add an
application-level encryption layer for blobs and how its keys are managed.

If client-side end-to-end encryption is added later, decide whether object
identity hashes plaintext or ciphertext. A plaintext-derived hash preserves
cross-device identity but reveals that two uploads contain the same bytes;
hashing ciphertext avoids that equality leak but needs stable ciphertext
generation to deduplicate.

## Decisions still open

- **Sharing:** authorize each blob by the referencing note's sharing
  selection, or disallow images in shared notes initially.
- **Encryption:** define the Worker/R2 at-rest protection and whether blob
  encryption is part of the future E2EE milestone.
- **Image policy:** confirm resize dimensions, supported formats, per-image
  cap, and total quota using a few real phone photos.
- **iCloud:** keep the server migration plan's iCloud decision open. This blob
  design assumes the selected server stores images; it does not decide which
  apps use iCloud versus the server.

## Implementation order

1. Add the rich-text image node and blob-reference extraction in core.
2. Add authenticated Worker endpoints, R2 binding, limits, and reference-aware
   cleanup; include blob access in account deletion and sharing authorization.
3. Add native and web image pickers, resizing, local caches, upload queue, and
   placeholder/retry rendering.
4. Verify upload/download, offline retry, account isolation, sharing access,
   quota refusal, garbage collection, and account deletion.
