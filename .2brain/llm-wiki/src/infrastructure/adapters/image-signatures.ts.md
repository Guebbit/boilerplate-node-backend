---
source: src/infrastructure/adapters/image-signatures.ts
source_sha256: 8878133f6c4589de4f759630949a1b0861826522bef0686c77e804ce0a881663
context_sha256: 7133d5b3cfc36f9684000e2dc82371812108b3fab9a717a4615290fac9695853
generated_at: 2026-11-22T02:36:47.936076+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/image-signatures.ts

## Purpose
Content-based image identification for uploads. A client's `Content-Type` is spoofable, so the real type is decided from the file's leading bytes (magic numbers). This guards against stored XSS, SVG-with-script uploads, and attacker-controlled input reaching decoders. It deliberately avoids a dependency like `file-type`, keeping the signature table small enough to audit.

## Key elements
- `SUPPORTED_IMAGE_FORMATS` (private): the signature table, taken from `imageRuleData.formats` in `./images.generated`. The source data is `shared/rules/images.yaml`. Raster formats only, with no SVG.
- `ImageFormat` (private interface): `mime`, optional `aliases`, `offset`, `bytes`, `extension`, and optional `alsoRequires` markers (e.g. WebP needs `RIFF` at 0 and `WEBP` at 8).
- `SIGNATURES_COVER_CONTRACT`: a compile-time check, using `SameMembers`, that `AcceptedUploadType` from `@api/upload-types` and the table's MIME types are the same set. Drift in either direction fails `tsc`.
- `ACCEPTED_UPLOAD_MIMETYPES`: a `ReadonlySet` of the contract's `ACCEPTED_UPLOAD_TYPES` plus the table's aliases, such as `image/jpg`.
- `identifyImage(header)`: returns the MIME type whose marker (and any `alsoRequires` markers) matches the buffer, or `undefined`. A short buffer matches nothing.
- `identifyImageFile(filePath)`: opens the file and reads only the first `HEADER_LENGTH` bytes, then calls `identifyImage`. It returns `undefined` for an unreadable or unrecognised file and always closes the handle.
- `extensionForImage(mime)`: the storage extension for an identified MIME type, or `undefined`.
- `normaliseDeclaredImageMime(declared)`: maps a declared alias to its canonical MIME type, so declared and sniffed types can be compared. Unknown values pass through unchanged.

## Relationships
- The neighbors `upload.ts` (HTTP upload middleware) and `image.worker.ts` are consumers in the dependency graph. The neighbor tests `image-signatures.test.ts` and `image.worker.test.ts` exercise this module. This file does not import any of them.
- `scripts/contracts/asyncapi-bundles.ts` is related through the graph. The file itself shows no direct interaction with it.

## Notes
- The extension comes from the detected type, never the client's `originalname`. Otherwise valid PNG bytes saved as `.html` would be served as `text/html` once uploads are served statically.
- `HEADER_LENGTH` is computed as the largest `offset + bytes.length` across all formats and their `alsoRequires` markers.
- `identifyImageFile` swallows all errors, so "missing file" and "not an image" are indistinguishable by design. It carries an ESLint disable for `no-restricted-syntax` on its `try`.
- `image/jpg` is tolerated as an alias but is not part of the API contract.
