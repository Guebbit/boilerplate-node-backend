---
source: src/infrastructure/adapters/image-store.ts
sha256: 723f3008fd88c32e370146ff16f033fc592ceff466421910e830da11b53ff990
generated_at: 2026-11-08T03:19:41.822600+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-store.ts

## Purpose

Defines the `ImageStore` port and its sole implementation (`filesystemImageStore`, local disk under `NODE_PUBLIC_PATH/images/`). It is the single place that translates between an opaque `imageUrl` handle and a real filesystem path, so that swapping the backend (e.g., to a bucket) touches one file instead of every service and controller that persists or deletes an image.

## Key elements

- **`ImageStore`** (interface) — the port. Methods:
  - `quarantine(stagedPath)` — moves a staged upload into a durable quarantine dir *outside* the public root; returns an opaque key. Throws on failure.
  - `readQuarantined(key)` / `removeQuarantined(key)` — read or discard a quarantined file before the digest job promotes it.
  - `promote(stem, digested, mime)` — writes the re-encoded original under a content-derived name; returns the server-relative URL. Throws on failure.
  - `putDerivative(stem, thumbnail)` — writes the WebP thumbnail under the *same* stem into `thumbs/v<version>/`. Throws on failure.
  - `remove(imageUrl)` — deletes the main image and its thumbnail. **Never rejects**; no-op for remote URLs or paths outside the public root.
- **`filesystemImageStore`** — the local-disk implementation of `ImageStore`.
- **`IMAGES_SEGMENT`** — `'images'`; must match the `express.static` mount and the URL segment.
- **`publicRoot()`** — resolves `NODE_PUBLIC_PATH` to an absolute directory.
- **`quarantineRoot()`** — resolves `NODE_QUARANTINE_PATH` (durable, outside public root).
- **`thumbnailsDirectory(root)`** — builds `<root>/images/thumbs/v<version>`.
- **`resolveUnderPublicRoot(imageUrl, root)`** — security guard: resolves a client-supplied `imageUrl` under the public root, rejecting path traversal.
- **`isRemoteUrl(value)`** — detects `scheme://` or `//` URLs so `remove` can skip them.
- **`writeAtomically(target, bytes)`** — wraps `writeFileAtomically` (write-to-temp + rename) to avoid serving half-written files under a 1-year immutable cache header.
- **`EXTENSION_OF`** — mime → file-extension map built from `imageRuleData.formats`.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — source of `deleteFile`, `moveFile`, `toPosixPath`, `writeFileAtomically`; all disk I/O primitives used here.
- **`src/infrastructure/adapters/image.ts`** — provides the `ReencodableImageMime` type; its `digestImage` / `thumbnailImage` produce the bytes this store writes.
- **`src/infrastructure/adapters/config.ts`** — provides `imageConfig()` (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`).
- **`src/infrastructure/adapters/images.generated.ts`** — provides `imageRuleData` (thumbnail version, accepted formats).
- **`src/infrastructure/http/middlewares/upload.ts`** — stages uploads to a temp path; this store's `quarantine` is the next step. Comments in both files reference each other's conventions.
- **`src/infrastructure/adapters/image.worker.ts`** — the digest job that calls `readQuarantined` → `digestImage` → `promote` / `putDerivative` → `removeQuarantined`. Derives the `stem` once and passes it to both promote calls.
- **Service-layer callers** (e.g. `modules/products/services/crud.ts`, `modules/example/services/cover.ts`) — depend on the `ImageStore` interface for persisting `imageUrl` values and calling `remove` on record deletion; they never construct filesystem paths themselves.

## Notes

- **Error contract is asymmetric on purpose:** `quarantine`, `promote`, `putDerivative` **throw** (the job must retry); `remove`, `removeQuarantined` **never reject** (they run on paths already answering an error to the client).
- **URL construction uses `'/'` literals**, not `path.join`, to avoid Windows backslashes leaking into `express.static` paths.
- **The `stem` is content-derived** (hash of digested bytes), so two runs of the same input converge on the same file (idempotent overwrite) while different inputs can never collide. This is what makes a stale digest run's cleanup safe.
- **Quarantine is outside `NODE_PUBLIC_PATH`** so nothing unvalidated is fetchable, and the file survives a restart (durability guarantee comes from the mounted volume in production, not the local-dev `tmp/quarantine` default).
- **`isRemoteUrl` deliberately avoids `URL.canParse`** because that function accepts `mailto:` and rejects protocol-relative `//` URLs; the regex here answers "is this a URL pointing somewhere else?" specifically.
- **Thumbnail version segment** (`THUMBNAIL_VERSION`) exists so quality-setting changes can bump the URL without overwriting existing immutable-cached files.
