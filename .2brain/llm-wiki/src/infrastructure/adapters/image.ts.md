---
source: src/infrastructure/adapters/image.ts
sha256: 5f37ad88061d160982ab1b1228b3947e167bdf3fdae630c21dd60f6c25309516
generated_at: 2026-10-01T12:48:28.706558+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.ts

## Purpose

Isolates all sharp/libvips interaction behind two pure `Buffer → Buffer` transforms (`digestImage`, `thumbnailImage`). Swapping the image library later means rewriting only these two functions, not hunting for sharp calls across the codebase.

## Key elements

- **`ReencodableImageMime`** (type) — Closed union `'image/png' | 'image/jpeg' | 'image/webp'`; the only formats the re-encoder accepts.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** (module-level side effects) — Cap libvips to one thread per fork and disable its repeated-operation cache. Execute on import in every cluster fork.
- **`decode(input: Buffer): Sharp`** (private) — Opens the buffer under a pixel-count ceiling (`NODE_IMAGE_MAX_INPUT_PIXELS`) and auto-orients from EXIF (`rotate()` with no args) before any metadata strip.
- **`reencode(pipeline, mime)`** (private) — Exhaustive `switch` over `ReencodableImageMime`; adding a fourth format to the union without a branch is a compile error.
- **`digestImage(input, mime): Promise<Buffer>`** (exported) — Decode → resize to `NODE_IMAGE_MAX_DIMENSION` (`fit: 'inside'`, `withoutEnlargement`) → re-encode to the **same** MIME → buffer. Drops all EXIF/ICC/XMP metadata.
- **`thumbnailImage(input): Promise<Buffer>`** (exported) — Decode → resize to `NODE_IMAGE_THUMBNAIL_DIMENSION` → always encode as **WebP** → buffer.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Imports `imageConfig`; reads `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION`, and `NODE_IMAGE_THUMBNAIL_DIMENSION` at call time (not frozen at import).
- **`src/infrastructure/adapters/image.worker.ts`** — Worker entry point that calls `digestImage` / `thumbnailImage` per message; the concurrency and cache settings here are what make that worker safe in a multi-fork deployment.
- **`src/infrastructure/adapters/image-store.ts`** — Consumes the resulting buffers to persist the digested original and the thumbnail at their respective public keys.
- **`scenarios/tools/generate-seed-images.ts`** — Offline script that invokes `digestImage` / `thumbnailImage` to produce seed assets.
- **`tests/unit/infrastructure/adapters/image.test.ts`** / **`image.worker.test.ts`** — Unit tests covering both transforms and the worker path.
- **`package.json`** — Declares the `sharp` dependency this module imports.

## Notes

- Importing this module has **side effects** (the two `sharp.*` calls). Any test that imports it inherits those settings.
- `digestImage` **never converts** format: the output MIME equals the input MIME, so the on-disk extension and the bytes stay consistent for `express.static`'s `Content-Type` lookup.
- `thumbnailImage` **always** outputs WebP regardless of input, because it lives at a distinct URL (`/images/thumbs/v1/<stem>.webp`) where the extension is under our control.
- `limitInputPixels` is resolved via `imageConfig()` at call time, consistent with the codebase's convention of reading env-backed config per invocation rather than caching at import.
