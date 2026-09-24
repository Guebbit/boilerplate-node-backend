---
source: src/infrastructure/adapters/image-store.ts
sha256: 54a94ad40868c97170f9c8ade475983c06a2a99243b4acd583fc7b6e8457d805
generated_at: 2026-09-23T17:39:28.511598+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-store.ts

## Purpose

Defines the `ImageStore` port — the single seam between application code and wherever image bytes physically live. Callers address images only by an opaque `imageUrl` string; this file is the sole place that translates that handle to a filesystem path (today: `NODE_PUBLIC_PATH/images/`). It exists so that swapping the storage backend (e.g. to an object bucket) is a change to one file rather than every service and controller.

## Key elements

- **`ImageStore` (interface)** — the port. Methods: `quarantine`, `readQuarantined`, `removeQuarantined`, `promote`, `putDerivative`, `remove`.
- **`filesystemImageStore` (const)** — the one concrete implementation, backed by local disk under `NODE_PUBLIC_PATH/images/`.
- **`quarantineRoot()` (exported)** — resolves the quarantine directory (`NODE_QUARANTINE_PATH` or `tmp/quarantine`). Used by this module and the reap script.
- **`resolveUnderPublicRoot`** (private) — maps a client-supplied `imageUrl` to a real path, rejecting anything that escapes the public root (path-traversal guard).
- **`isRemoteUrl`** (private) — detects absolute-scheme and protocol-relative URLs so `remove` can no-op them instead of attempting a local unlink.
- **`EXTENSION_OF`, `IMAGES_SEGMENT`, `THUMBNAIL_VERSION`** — constants that pin the on-disk layout and URL shape.
- **`thumbnailFilename`, `thumbnailsDirectory`** (private) — derive the thumbnail path from the original's `stem`.

## Relationships

- **`@infrastructure/adapters/filesystem`** — imports `deleteFile`, `moveFile`, `toPosixPath` for the actual I/O.
- **`@infrastructure/adapters/image`** — imports the `ReencodableImageMime` type (the three accepted formats).
- **`image.worker.ts`** — the digest job that calls `readQuarantined`, `promote`, `putDerivative`, and `removeQuarantined`; it derives the `stem` once and passes it to both `promote` and `putDerivative` so `remove` can find the thumbnail from the main image's filename alone.
- **`http/middlewares/upload.ts`** — stages uploads to a private temp path, then hands that path to `quarantine`; the quarantine directory it targets is this module's `quarantineRoot()`.
- **`scripts/ops/reap-quarantine.ts`** — consumes `quarantineRoot()` (or `removeQuarantined`) to clean up stale quarantine entries.
- **`modules/products/service.ts`, `modules/users/service.ts`** — callers that read `imageUrl` from documents and pass it to `remove` on delete/replace; they never construct a filesystem path themselves.
- **`tests/unit/infrastructure/adapters/image-store.test.ts`** — unit tests for every `ImageStore` method against the filesystem implementation.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — exercises the worker→store interaction (promote, putDerivative, removeQuarantined paths).

## Notes

- **Throw vs. never-throw split is intentional.** `quarantine`, `promote`, `putDerivative` throw (a failed write means the job must be retried). `removeQuarantined` and `remove` never throw (they run on failure/cleanup paths where a second error would be worse than a silent no-op).
- **`remove` only unlinks flat files directly inside `<public>/images/`.** Anything in a subdirectory (e.g. `images/seed/` demo fixtures) is a no-op, so replacing a seeded record's image cannot destroy committed test assets.
- **URLs are built with string literals, not `path.join`.** On Windows `path.join` would produce backslashes that `express.static` and browsers reject.
- **`THUMBNAIL_VERSION` exists because responses are cached with `immutable, 1y`.** Bumping the segment (v1 → v2) is the only way to change thumbnail quality without invalidating live URLs.
- **Quarantine is deliberately outside `NODE_PUBLIC_PATH`** so unvalidated bytes are never fetchable by the static file server, and a restart does not lose a file a pending job still needs.
- **`resolveUnderPublicRoot` joins with `'.' + relative`** rather than a bare `path.resolve(root, relative)`, because a leading `/` in `imageUrl` would otherwise make `path.resolve` discard `root` entirely and land at the filesystem root.
