# src/infrastructure/http/uploads.ts

## Purpose

Read-side helper for multer-processed Express requests. Normalises the three shapes multer can attach to `request` (`.single`, `.array`, `.fields`) into uniform return types, and exposes the stored-image metadata (URLs, pending keys) that the storage adapter writes onto the request during the write phase. Controllers import this instead of touching `request.file` / `request.files` / `request.storedImageUrls` directly.

## Key elements

- **`toPosixPath(value: string): string`** — Replaces every `\` with `/`. Used when a filesystem path must be turned into a URL-safe path; safe here because upload filenames are random hex.
- **`getFormFiles(request: Request): string[] | undefined`** — Returns the flat list of uploaded file paths regardless of whether the route used `multer.single()`, `.array()`, or `.fields()`. Normalises an empty upload to `undefined` so callers have a single falsy check.
- **`resolveImageUrl(request): string | undefined`** — Reads `request.storedImageUrls?.[0]`; the CDN/local URL produced when the storage adapter digested the image inline.
- **`resolveThumbnailUrl(request): string | undefined`** — Reads `request.storedThumbnailUrls?.[0]`; the thumbnail URL produced alongside the image.
- **`resolvePendingImageKey(request): string | undefined`** — Reads `request.quarantinedImageKeys?.[0]`; present when a broker will digest the image asynchronously instead of inline.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — Owns the write side. Its `quarantineUploadedImages` function populates `storedImageUrls`, `storedThumbnailUrls`, and `quarantinedImageKeys` on the request; this module is the only consumer that reads those properties back into controller-usable values.
- **`src/infrastructure/adapters/image-store.ts`** — The async "broker" referenced by `resolvePendingImageKey`; when it takes a digest job the image key is stored on the request here and resolved later.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — Unit tests covering the normalisation logic in `getFormFiles` and the path/url/key resolvers.

## Notes

- `toPosixPath` deliberately uses a literal `replaceAll('\\', '/')` rather than `path.posix.normalize()`, which would leave backslashes intact (they are legal filename characters on POSIX).
- The three `resolve*` functions are mutually exclusive per request: either the image was digested inline (URL + thumbnail available) or queued for the broker (pending key available, no URL yet). Callers should check `resolveImageUrl` first and fall back to `resolvePendingImageKey`.
- All `resolve*` functions accept `Pick<Request, …>` rather than the full `Request`, so they can be called with minimal stubs in tests.
