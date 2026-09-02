# src/infrastructure/adapters/image-store.ts

## Purpose

Single port (interface + implementation) through which every caller persists, retrieves, and deletes user-uploaded images. It exists to prevent the "move uploads to a bucket" change from touching five files: only this module translates an opaque `imageUrl` into a filesystem path. Today the sole backend is local disk under `NODE_PUBLIC_PATH/images/`.

## Key elements

- **`ImageStore` (interface)** — the port. Methods:
  - `quarantine(stagedPath)` — moves a multer-staged upload into a durable quarantine dir (outside `NODE_PUBLIC_PATH`); **throws** on failure. Returns an opaque key.
  - `readQuarantined(key)` — reads raw bytes for the digest step.
  - `removeQuarantined(key)` — deletes a quarantined file without promoting; **never throws**.
  - `promote(key, digested)` — writes the re-encoded original under the public images dir; **throws** on failure. Returns the server-relative URL.
  - `putDerivative(key, thumbnail)` — writes a WebP thumbnail under `images/thumbs/v1/`; **throws** on failure. Returns the thumbnail URL.
  - `remove(imageUrl?)` — deletes a stored image **and** its thumbnail; **never throws**, returns a boolean.
- **`filesystemImageStore`** — the concrete implementation using `node:fs/promises` + helpers from `filesystem.ts`.
- **`imageStore`** — the export the application consumes (currently an alias for `filesystemImageStore`; no backend switch exists by design).
- **`RequestImage` (interface)** — the slice a write controller extracts from a request: `imageUrl` and `thumbnailUrl` to persist.
- **`resolveUnderPublicRoot`** (private) — security check that a client-supplied `imageUrl` cannot escape the public root via `..` traversal.
- **`isRemoteUrl`** (private) — identifies absolute/protocol-relative URLs so `remove` is a no-op for CDN or default-image values.
- **`IMAGES_SEGMENT`**, **`THUMBNAIL_VERSION`**, **`quarantineRoot()`**, **`publicRoot()`** — path/URL constants that keep the directory name, URL segment, and static-mount path in agreement.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — provides `deleteFile` and `moveFile` used by every write/delete operation in this file.
- **`src/infrastructure/http/uploads.ts`** — provides `resolveImageUrl`, `resolvePendingImageKey`, `resolveThumbnailUrl`, `toPosixPath`, which callers use alongside this port to extract the image half of a request.
- **`src/infrastructure/adapters/image.worker.ts`** — the digest worker that calls `readQuarantined` → `promote` / `putDerivative` (or `removeQuarantined` on failure) and whose ack policy depends on this port's throw/never-throw contract.
- **`src/infrastructure/adapters/storage.ts`** — handles the earlier upload-staging step (multer temp path); this file takes over after staging is complete.
- **`src/modules/products/service.ts`**, **`write-products.ts`**, **`write-users.ts`**, **`put-account.ts`**, **`post-signup.ts`** — write controllers/services that consume `RequestImage` and call `imageStore.remove` on replace/delete.
- **`tests/unit/infrastructure/adapters/image-store.test.ts`** — unit tests for the port implementation.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — exercises the worker's interaction with this port.

## Notes

- **Error-semantics split is deliberate:** `quarantine`, `promote`, `putDerivative` **throw** so the broker/job can retry; `remove`, `removeQuarantined` **never throw** so cleanup on an already-failing path cannot produce a second, different error.
- **`remove` only deletes flat files directly in `<public>/images/`.** Subdirectories (e.g. `images/seed/` for committed demo fixtures) are untouched, preventing a replaced-image flow from unlinking a seeded fixture.
- **Thumbnail deletion is coupled to `remove`.** This is the only call site that knows an image is going away; omitting it would leak thumbnails permanently.
- **URLs are built from string literals, not `path.join`**, to avoid Windows backslashes in server-relative URLs.
- **No backend selector exists intentionally.** Adding one before a second implementation is written risks a half-migrated deployment. When a bucket/CDN backend arrives, `promote` may return absolute URLs while existing rows hold `/images/x.png` — both are valid `uri-reference` values and both must keep working.
- **Quarantine dir is outside `NODE_PUBLIC_PATH`** so nothing unvalidated is publicly fetchable, and the dir is durable across restarts (unlike multer's ephemeral staging).
