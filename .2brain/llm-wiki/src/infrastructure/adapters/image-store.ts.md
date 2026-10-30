---
source: src/infrastructure/adapters/image-store.ts
sha256: 723f3008fd88c32e370146ff16f033fc592ceff466421910e830da11b53ff990
generated_at: 2026-10-29T01:54:30.770419+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-store.ts

## Purpose

Defines the `ImageStore` port and its single local-filesystem implementation. It is the one place in the codebase that maps an opaque `imageUrl` handle to a real filesystem path, so that swapping the backend (e.g. to an object bucket) is a change to this file alone rather than to every service and controller that reads or writes images.

## Key elements

- **`ImageStore` (interface)** — the port every external caller uses. Methods: `quarantine` (move staged upload to a durable, non-public location), `readQuarantined`, `removeQuarantined`, `promote` (write digested original under a content-derived name), `putDerivative` (write thumbnail under the same stem), `remove` (delete original + thumbnail by `imageUrl`).
- **`filesystemImageStore`** — the concrete implementation using `NODE_PUBLIC_PATH/images/` and a quarantine directory under `NODE_QUARANTINE_PATH`.
- **`IMAGES_SEGMENT`** (`'images'`) — the single constant tying the served folder name, the URL segment, and the path together.
- **`publicRoot()` / `quarantineRoot()`** — resolve the config-driven base directories.
- **`thumbnailsDirectory(root)` / `thumbnailFilename(key)`** — compute the versioned thumbnail path (`images/thumbs/v1/<stem>.webp`).
- **`resolveUnderPublicRoot(imageUrl, root)`** — security check that rejects any path escaping the public root (guards against `..` traversal in client-supplied `imageUrl`).
- **`isRemoteUrl(value)`** — detects absolute or protocol-relative URLs so `remove` treats them as no-ops rather than trying to unlink them locally.
- **`writeAtomically`** — wraps `writeFileAtomically` (write-to-temp + rename) to prevent serving a half-written file under the `immutable, 1y` cache header.
- **`EXTENSION_OF`** — mime → file-extension map derived from `imageRuleData.formats`.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — provides `deleteFile`, `moveFile`, `toPosixPath`, `writeFileAtomically` used throughout the implementation.
- **`src/infrastructure/adapters/image.ts`** — source of the `ReencodableImageMime` type; `digestImage` / `thumbnailImage` produce the bytes that `promote` / `putDerivative` persist.
- **`src/infrastructure/adapters/images.generated.ts`** — supplies `imageRuleData` (accepted formats, extensions, thumbnail version).
- **`src/infrastructure/adapters/config.ts`** — `imageConfig()` provides `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH`.
- **`src/infrastructure/adapters/image.worker.ts`** — the digest worker that calls `readQuarantined`, `promote`, and `putDerivative`; it derives the shared `stem` once and passes it to both publish methods.
- **`src/infrastructure/http/middlewares/upload.ts`** — stages uploads to a private path that `quarantine` then moves; shares the "create directory on demand" convention.

## Notes

- **Error-policy asymmetry:** `quarantine`, `promote`, and `putDerivative` **throw** on failure (a job worth retrying). `remove`, `removeQuarantined` **never throw** (called on paths already answering an error to the client). Callers must not wrap the throwing methods in a catch that swallows the failure.
- **Stem-based naming:** Both original and thumbnail are filed under the same content-derived `stem`, so `remove` can locate the thumbnail from the main image's filename alone without needing the thumbnail's bytes.
- **Atomic writes are mandatory:** images are served with `Cache-Control: immutable, 1y`. A plain `writeFile` truncates in place; a reader landing mid-write would cache a corrupt image for a year.
- **URL construction uses string literals**, not `path.join`, to avoid backslashes on Windows that `express.static` and browsers would not interpret.
- **Quarantine directory is deliberately outside `NODE_PUBLIC_PATH`** so no unvalidated bytes are reachable via HTTP before the digest job promotes them. The local-dev default (`tmp/quarantine`) is a convenience only; production must set `NODE_QUARANTINE_PATH` to a durable volume.
- **`imageUrl` is client-supplied** on create/update endpoints and only constrained to `uri-reference`; all path resolution goes through `resolveUnderPublicRoot` to prevent directory traversal.
