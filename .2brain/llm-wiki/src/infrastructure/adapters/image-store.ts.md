---
source: src/infrastructure/adapters/image-store.ts
source_sha256: 2687ac860f89aa295f9aada8efb6de12b8e342156f0c99bfbee7a8c111ebfa87
context_sha256: 387ab3c601fc27d30a25fa8eecc822829e6ff987a6d84efa1a6e1050b0e8d35d
generated_at: 2026-11-22T02:37:09.807337+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/image-store.ts

## Purpose
The storage port for images. It is the only place allowed to turn an `imageUrl` into a filesystem path, so callers treat `imageUrl` as an opaque handle and a future move to a bucket touches one file. One backend exists today: local files under `NODE_PUBLIC_PATH/images/`.

## Key elements
- **`ImageStore` (interface)**: the seam between an upload and wherever its bytes live.
  - `quarantine(stagedPath)`: moves a staged upload into durable storage outside `NODE_PUBLIC_PATH` and returns an opaque key. Throws on failure.
  - `readQuarantined(key)`: returns the raw bytes for the digest step. Throws if nothing is stored under the key.
  - `removeQuarantined(key)`: deletes a quarantined file without promoting it. Never rejects; returns a boolean.
  - `promote(stem, digested, mime)`: writes the re-encoded original under a name derived from its own bytes and returns the `imageUrl` to persist. Throws on failure.
  - `putDerivative(stem, thumbnail)`: writes a thumbnail under the same `stem` at `thumbs/<version>/<stem>.webp` and returns its url. Throws on failure.
  - `remove(imageUrl)`: deletes an image and its thumbnail. Never rejects. Anything the store does not own (absolute URL, path outside its root, nothing at all) is a no-op.
- **`filesystemImageStore`**: the local implementation of `ImageStore`.
- **`IMAGES_SEGMENT`** (`'images'`): the directory name, key prefix and URL segment. These must agree because `express.static` serves `NODE_PUBLIC_PATH` at the site root.
- **`publicRoot()`**: resolves `NODE_PUBLIC_PATH`.
- **`quarantineRoot()`**: resolves `NODE_QUARANTINE_PATH`.
- **`thumbnailsDirectory(root)`**: returns `<root>/images/thumbs/<THUMBNAIL_VERSION>`.
- Internal helpers:
  - `resolveUnderPublicRoot`: maps an `imageUrl` to a path and returns `undefined` if it would escape the root.
  - `isRemoteUrl`: detects absolute (`scheme://`) and protocol-relative (`//`) URLs.
  - `writeAtomically`: wraps `writeFileAtomically`.
  - `thumbnailFilename`: builds the `.webp` filename from a stem.
  - `EXTENSION_OF`: maps mime type to file extension, built from `imageRuleData.formats`.

## Relationships
- **`src/infrastructure/adapters/filesystem.ts`**: supplies `deleteFile`, `moveFile`, `toPosixPath` and `writeFileAtomically`, which do the actual file operations.
- **`src/infrastructure/adapters/config.ts`**: `imageConfig()` provides `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH`.
- **`src/infrastructure/adapters/image.ts`**: provides the `ReencodableImageMime` type. `digestImage` and `thumbnailImage` produce the bytes passed to `promote` and `putDerivative`.
- **`src/infrastructure/adapters/image.worker.ts`**: derives the `stem` once from the digested bytes and passes it to both `promote` and `putDerivative`. Its ack policy depends on those methods throwing.
- **`src/infrastructure/http/middlewares/upload.ts`**: handles ephemeral upload staging. The quarantine location is documented as separate from its staging path, and `quarantine` mirrors its on-demand directory creation.
- The remaining neighbors are `src/app/jobs.ts`, `src/infrastructure/adapters/orphaned-images.ts`, `src/infrastructure/adapters/remote-image.ts`, `src/infrastructure/http/uploads.ts`, and the oauth, cover, crud and personal-data services. They are likely consumers of the store. The visible portion of the file does not show how they use it.

## Notes
- **Security**: `imageUrl` is client-supplied and `uri-reference` permits `/../..`. `resolveUnderPublicRoot` therefore compares the resolved destination and rejects anything outside the root, including the root itself.
- **Content-derived names**: `promote` names files from their own bytes. Duplicate digest runs of the same input write identical files. Different inputs cannot collide, so a stale run's cleanup can never delete a newer run's file. The name also acts as a cache-buster.
- **Atomic writes**: URLs are served `immutable, 1y`, so writes go through a temp file and rename. This avoids caching a half-written image.
- **Thumbnails**: they live under a versioned path. Bump `THUMBNAIL_VERSION` instead of overwriting files in place.
- **Returned URLs**: they are built from string literals, not `path.join`, to avoid backslashes on Windows.
- **Quarantine**: `quarantine`, `readQuarantined` and `removeQuarantined` apply `path.basename` to keys and stems. The `tmp/quarantine` default is for local development only. Production must mount a durable volume via `NODE_QUARANTINE_PATH`.
- **Error contract**: the write-side methods throw so requests and jobs fail or retry. The remove-side methods never reject, so cleanup on an error path cannot add a second failure.
