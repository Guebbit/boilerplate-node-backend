# src/infrastructure/http/uploads.ts

## Purpose

Read-side upload helpers that normalize the three shapes multer can put on an Express request (`.single`, `.array`, `.fields`) into one uniform array of paths, and expose the committed image URL. The write side (where files land, naming, persistence) lives entirely in the storage adapters; this module only makes controllers indifferent to which multer middleware variant a route used.

## Key elements

- **`toPosixPath(value: string): string`** — Replaces every `\` with `/`. Used to turn a Windows-style `path.join()` result into a URL-safe path. Deliberately does *not* use `path.posix.normalize` (which would leave backslashes intact on POSIX).
- **`getFormFiles(request: Request): string[] | undefined`** — Extracts uploaded file paths regardless of whether the route used `.single()`, `.array()`, or `.fields()`. Returns a flat `string[]` of paths, or `undefined` when no files were uploaded (collapsing the empty-array case).
- **`resolveImageUrl(request: Request): string | undefined`** — Returns `request.storedImageUrls?.[0]`. The URL is set by the image store at commit time; this function only reads it back so controllers never construct or strip filesystem paths.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — Owns the write side (file naming, where bytes land). `resolveImageUrl` reads back the URL the storage layer set on the request.
- **`src/infrastructure/adapters/image-store.ts`** — Produces the `storedImageUrls` array on the request via its `storeUploadedImages` flow; `resolveImageUrl` is the sole read accessor for that value.
- **`src/modules/account/controllers/post-signup.ts`**, **`put-account.ts`**, **`src/modules/products/controllers/write-products.ts`**, **`src/modules/users/controllers/write-users.ts`** — Consumer controllers that call `getFormFiles` / `resolveImageUrl` instead of touching `req.file` / `req.files` directly.
- **`tests/unit/infrastructure/http/uploads.test.ts`** — Unit tests covering the three multer shapes and the empty-file normalization.

## Notes

- `getFormFiles` normalizes "present but empty" (e.g. `req.files = []`) to `undefined` so callers have a single falsy check rather than distinguishing `[]` from `undefined`.
- `resolveImageUrl` takes index `[0]` unconditionally — these endpoints accept one image; extras are silently ignored.
- The URL is never derived by stripping `NODE_PUBLIC_PATH` off a multer path. The store builds it, keeping filesystem separators out of the persisted value entirely.
