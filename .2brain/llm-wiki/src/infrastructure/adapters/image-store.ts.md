---
source: src/infrastructure/adapters/image-store.ts
sha256: a5524ba0c5e437b015d2d433ef9cd6b027f8eb61478ba8ab0162a8ef6ec1ff7d
generated_at: 2026-09-27T14:05:55.988385+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-store.ts

## Purpose

Port-and-implementation for image storage. It isolates every conversion between an opaque `imageUrl` handle and a concrete filesystem path so that callers (services, controllers, workers) never spell out path construction themselves. Swapping the backend (e.g. to an object bucket) becomes a one-file change. Today the sole backend is local disk under `NODE_PUBLIC_PATH/images/`.

## Key elements

- **`ImageStore`** (interface) — the contract every caller programs against. Methods: `quarantine`, `readQuarantined`, `removeQuarantined`, `promote`, `putDerivative`, `remove`.
- **`filesystemImageStore`** (exported const) — the local-disk implementation of `ImageStore`.
- **`quarantineRoot()`** (exported) — resolves the quarantine directory (`NODE_QUARANTINE_PATH` or `tmp/quarantine`). Intentionally *outside* the public root so unvalidated bytes are never fetchable.
- **`resolveUnderPublicRoot`** — maps an `imageUrl` to a real path, rejecting anything that escapes the public root (path-traversal guard).
- **`isRemoteUrl`** — detects absolute (`https://…`) and protocol-relative (`//…`) URLs so `remove` is a no-op for external images (e.g. the configured default).
- **`writeAtomically`** — writes to a temp file then `rename`s into place, avoiding a mid-write read on a file served with `Cache-Control: immutable, 1y`.
- **`EXTENSION_OF`** — maps the three accepted MIME types to their file extensions.
- **`IMAGES_SEGMENT` / `THUMBNAIL_VERSION`** — URL-segment constants; the version segment exists because the immutable cache cannot be revalidated in place.

## Relationships

- **`@infrastructure/adapters/filesystem`** — supplies `deleteFile`, `moveFile`, and `toPosixPath` helpers used throughout the implementation.
- **`@infrastructure/adapters/image`** — provides the `ReencodableImageMime` type; the worker calls its `digestImage` / `thumbnailImage` and passes the results to `promote` / `putDerivative`.
- **`image.worker.ts`** — the digest job that drives the store's lifecycle: `readQuarantined` → `promote` + `putDerivative` → (on failure) `removeQuarantined` / `remove`.
- **`http/middlewares/upload.ts`** — stages the upload to a private path; `quarantine` then moves it into the quarantine directory.
- **`http/uploads.ts`** — orchestrates the request flow that stages and quarantines uploads.
- **`modules/products/service.ts`** / **`modules/users/service.ts`** — call `remove` (or `removeQuarantined`) when a record that owns an image is deleted.
- **`scripts/ops/reap-quarantine.ts`** — ops script that calls `removeQuarantined` for stale entries.
- **`tests/unit/infrastructure/adapters/image-store.test.ts`** — unit tests for the store itself.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — exercises the store through the worker's flow.

## Notes

- **Error-asymmetry is intentional.** `quarantine`, `promote`, `putDerivative`, and `readQuarantined` *throw* on failure (the caller must retry or fail the request). `remove` and `removeQuarantined` *never* throw — they run on paths that are already answering an error and must not introduce a second, different failure.
- **URLs are built with string literals, not `path.join`.** `promote` and `putDerivative` return forward-slash URLs; using `path.join` would produce backslashes on Windows that `express.static` won't serve.
- **`stem` couples original and thumbnail.** The worker derives `stem` once from the digested bytes and passes the same value to both `promote` and `putDerivative`. This lets `remove` find a thumbnail from the main image's filename alone, without needing the thumbnail's bytes.
- **Quarantine durability.** The `tmp/quarantine` default is a local-dev convenience only. Production must set `NODE_QUARANTINE_PATH` to a durable mount; a restart that loses quarantined files leaves records stuck on a placeholder.
- **`path.resolve` leading-slash trap.** `resolveUnderPublicRoot` prepends `'.'` before joining to avoid `path.resolve(root, '/images/x')` resolving to the filesystem root.
