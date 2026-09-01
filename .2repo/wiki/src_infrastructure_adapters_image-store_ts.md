# src/infrastructure/adapters/image-store.ts

## Purpose

Defines the `ImageStore` port — the single boundary through which all callers interact with image persistence. It guarantees that no code outside this file converts an `imageUrl` into a filesystem path, so swapping the local-disk backend for S3/CDN touches one file instead of every write controller. Currently the only concrete implementation (`filesystemImageStore`) stores files under `NODE_PUBLIC_PATH/images/`.

## Key elements

- **`ImageStore`** (interface) — the port. Seven methods split into two failure contracts:
  - *Throwing* (retryable): `quarantine`, `promote`, `putDerivative`, `readQuarantined`, `readImage`.
  - *Never rejecting* (cleanup on error paths): `removeQuarantined`, `remove`.
- **`filesystemImageStore`** (exported const) — the local-disk implementation of `ImageStore`. All callers receive this value today.
- **`resolveUnderPublicRoot`** — path-traversal guard; refuses any `imageUrl` that resolves outside the public root.
- **`isRemoteUrl`** — detects absolute/protocol-relative URLs so `remove` is a no-op for externally-hosted or default images.
- **`IMAGES_SEGMENT` / `THUMBNAIL_VERSION`** — constants kept in sync with the `express.static` mount and the immutable cache headers; bumping `THUMBNAIL_VERSION` rotates thumbnails without overwriting in-place.

## Relationships

- **`@infrastructure/adapters/filesystem`** — supplies `deleteFile` and `moveFile` used by `quarantine`, `removeQuarantined`, `remove`, and `putDerivative`.
- **`@infrastructure/http/uploads`** — supplies `toPosixPath` (path normalisation for `resolveUnderPublicRoot`); also exports `resolveImageUrl` / `resolvePendingImageKey` / `resolveThumbnailUrl` which callers use *before* handing a key to this store.
- **`@infrastructure/adapters/image.worker.ts`** — the digest job that calls `readQuarantined` → (decode) → `promote` / `putDerivative` / `removeQuarantined` in sequence.
- **`@infrastructure/adapters/storage.ts`** — provides the upstream staging path (`stagedPath`) that `quarantine` moves; its `resolveUploadDestination` mirrors the `mkdir` strategy used here.
- **Write controllers** (`post-signup`, `put-account`, `write-users`, `write-products`, `products/service`) — the call sites that invoke `quarantine` at request time and `remove` on delete/replace.
- **`scripts/backfill-image-thumbnails.ts`** — the sole caller of `readImage`; allowed to read any file under the images root, including `images/seed/` fixtures.
- **`tests/unit/infrastructure/adapters/image-store.test.ts`** — unit tests for the interface contract and filesystem implementation.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — exercises the worker's interaction with `ImageStore` (quarantine → promote → removeQuarantined).

## Notes

- **URL construction is literal, not `path.join`.** `promote` and `putDerivative` build the returned URL with template strings (`/images/<name>`) to avoid Windows backslashes that `express.static` and browsers would not handle.
- **Quarantine is outside `NODE_PUBLIC_PATH` by design.** A quarantined file must survive a container restart so a pending digest job can still find it; placing it under the public tree would make unvalidated bytes fetchable.
- **`remove` only unlinks flat files directly under `images/`.** Subdirectory files (e.g. `images/seed/`) are treated as owned by another system and are never deleted by this method.
- **`remove` also deletes the matching thumbnail** (best-effort) because it is the only call site aware that a document's image is going away.
- **No backend selector exists intentionally.** The file documents that a future S3/CDN implementation would be a second `ImageStore` value; the switch has not been written yet.
- **`imageUrl` is an opaque handle.** Callers must never parse, split, or re-derive a filesystem path from it. The `uri-reference` format allows `../` sequences, which is why `resolveUnderPublicRoot` exists.
