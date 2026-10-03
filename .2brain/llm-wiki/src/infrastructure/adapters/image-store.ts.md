---
source: src/infrastructure/adapters/image-store.ts
sha256: 7580e3169c3bc98bc487c2a3561ee7c9c0e52bb9187a04eff0b281c074395b0b
generated_at: 2026-10-01T12:48:14.948195+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-store.ts

## Purpose

Defines the `ImageStore` port — the single seam between the rest of the application and wherever image bytes actually live. Callers outside this file never construct filesystem paths from an `imageUrl`; they only pass the opaque URL string to the store's methods. Today the sole implementation (`filesystemImageStore`) stores files under `NODE_PUBLIC_PATH/images/` served by `express.static`, but the interface is designed so a bucket-backed backend can be swapped in without touching callers.

## Key elements

- **`ImageStore`** (interface) — the port. Methods:
  - `quarantine(stagedPath)` — moves a staged upload into a durable, non-public quarantine directory. Throws on failure.
  - `readQuarantined(key)` — reads raw bytes back for the digest step. Throws if missing.
  - `removeQuarantined(key)` — deletes a quarantined upload. Never throws.
  - `promote(stem, digested, mime)` — writes the re-encoded original under a content-derived name, returns the server-relative URL. Throws on failure.
  - `putDerivative(stem, thumbnail)` — writes the thumbnail under the same `stem`, returns its URL. Throws on failure.
  - `remove(imageUrl)` — deletes the stored image + its thumbnail. Never throws; no-op for remote URLs or paths outside the store's root.
- **`IMAGES_SEGMENT`** — the constant `'images'` used both as the directory name and the URL segment.
- **`publicRoot()`** — resolves `imageConfig().NODE_PUBLIC_PATH`.
- **`quarantineRoot()`** — resolves `imageConfig().NODE_QUARANTINE_PATH` (outside `publicRoot` by design).
- **`filesystemImageStore`** — the local-fs implementation of `ImageStore`.
- **`resolveUnderPublicRoot`** (private) — joins a client-supplied `imageUrl` to the public root, rejecting any path that would escape it (traversal guard).
- **`isRemoteUrl`** (private) — detects absolute (`https://…`) and protocol-relative (`//…`) URLs so `remove` skips them.
- **`writeAtomically`** (private) — writes via a sibling temp file + `rename` to avoid a mid-write request being cached as a truncated image (1-year immutable header).

## Relationships

- **`src/infrastructure/adapters/config.ts`** — provides `imageConfig()` which supplies `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH`; consumed by `publicRoot()` and `quarantineRoot()`.
- **`src/infrastructure/adapters/filesystem.ts`** — provides `deleteFile`, `moveFile`, `toPosixPath` used inside the `filesystemImageStore` implementation.
- **`src/infrastructure/adapters/image.ts`** — supplies the `ReencodableImageMime` type used in `promote`'s signature.
- **`src/infrastructure/adapters/image.worker.ts`** — the digest job that drives the `quarantine → readQuarantined → promote / putDerivative → removeQuarantined` lifecycle and derives the shared `stem` from digested bytes.
- **`src/infrastructure/adapters/remote-image.ts`** — an alternative `ImageStore` implementation for non-local backends (same interface, different bytes).
- **`src/infrastructure/http/middlewares/upload.ts`** — stages the raw upload to a private temp path; the subsequent call to `ImageStore.quarantine` moves it into the durable quarantine area.
- **`src/infrastructure/http/uploads.ts`** — the HTTP layer that initiates the upload → quarantine → job-submission flow.
- **`src/modules/products/services/crud.ts`**, **`src/modules/users/services/update.ts`**, **`src/modules/account/services/oauth.ts`** — read/write the `imageUrl` field on their documents; never resolve it to a path themselves.
- **`src/modules/products/services/remove.ts`**, **`src/modules/users/services/remove.ts`** — call `ImageStore.remove(imageUrl)` when a record is deleted so the stored bytes are cleaned up.
- **`scripts/ops/clean-orphaned-images.ts`** — ops script that calls `ImageStore.remove` to purge images no longer referenced by any document.
- **`scripts/ops/reap-quarantine.ts`** — ops script that calls `ImageStore.removeQuarantined` to delete quarantined uploads that were never promoted (e.g. jobs lost to a crash).

## Notes

- **Error-asymmetry is intentional.** `quarantine`, `readQuarantined`, `promote`, `putDerivative` *throw* because a failed write means the caller must retry or surface an error. `remove`, `removeQuarantined` *never throw* because they run on already-failing paths and a second exception would mask the original.
- **`imageUrl` is a URL, not a path.** `promote` and `putDerivative` build return strings with forward-slash literals (`/images/x.png`) rather than `path.join`, because a backslash from Windows `path.join` would produce a broken URL.
- **Content-derived naming for originals, stem-derived naming for thumbnails.** `promote` derives the filename from the digested bytes (content hash → name), so identical content converges and different content never collides. `putDerivative` uses the caller-supplied `stem` (the original's name minus extension) so `remove` can locate the thumbnail from the main image's filename alone without needing the thumbnail's bytes.
- **Thumbnail version segment** (`thumbs/v1/`) exists so a future quality-settings change can bump to `v2` without in-place overwrites — all image URLs are served `immutable, max-age=1y`.
- **Quarantine directory is outside `publicRoot` by design.** A quarantined file must survive a process restart (durable on a mounted volume in production) and must never be reachable via `express.static`.
- **`resolveUnderPublicRoot` uses `path.resolve(root, '.' + relative)` rather than `path.resolve(root, relative)`** to avoid the leading-slash trap where `path.resolve('/a', '/b')` yields `/b` instead of `/a/b`.
