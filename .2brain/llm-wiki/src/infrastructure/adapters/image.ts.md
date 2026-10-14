---
source: src/infrastructure/adapters/image.ts
sha256: 379cbce73392aec56d52b425bcc4742897b58a00cbfdccc08c661eaf987f4bc5
generated_at: 2026-10-14T07:44:25.066049+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.ts

## Purpose

Wraps `sharp` behind two pure `Buffer → Buffer` transforms (`digestImage`, `thumbnailImage`) so that no other file in the codebase touches the sharp API directly. Swapping the image library later means rewriting only this file. All sharp-specific configuration (concurrency, cache) is also set here at module load.

## Key elements

- **`ReencodableImageMime`** (exported type) — Closed union of the three accepted formats: `'image/png' | 'image/jpeg' | 'image/webp'`.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** (module-level side effects) — Cap libvips to one thread per process (matters under cluster forks) and disable the repeated-operation cache (useless for one-shot transforms).
- **`decode(input: Buffer): Sharp`** (internal) — Decodes a buffer with a `limitInputPixels` cap (read from `imageConfig()` at call time) and auto-orients via `rotate()`.
- **`reencode(pipeline: Sharp, mime: ReencodableImageMime): Sharp`** (internal) — `switch` over the closed MIME union; guarantees TypeScript flags a missing branch if a fourth format is added.
- **`digestImage(input, mime): Promise<Buffer>`** (exported) — Decode → resize (longest edge ≤ `NODE_IMAGE_MAX_DIMENSION`, `fit: 'inside'`, no upscaling) → re-encode to the *same* MIME type. Strips EXIF/ICC/XMP as a side effect of the encode.
- **`thumbnailImage(input): Promise<Buffer>`** (exported) — Decode → resize (longest edge ≤ `NODE_IMAGE_THUMBNAIL_DIMENSION`) → always WebP. Always WebP because the thumbnail is stored at its own key, never under the original's URL.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Imports `imageConfig`; reads `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION`, and `NODE_IMAGE_THUMBNAIL_DIMENSION` at call time (not import time).
- **`src/infrastructure/adapters/image.worker.ts`** — Consumes `digestImage` / `thumbnailImage` to run the transforms inside a worker thread, keeping the event loop free.
- **`src/infrastructure/adapters/image-store.ts`** — Receives the `Buffer` returned by `digestImage` / `thumbnailImage` and persists it to the public or thumbnail store.
- **`scenarios/tools/generate-seed-images.ts`** — Calls `digestImage` / `thumbnailImage` to produce seed assets.
- **`tests/unit/infrastructure/adapters/image.test.ts`** — Unit-tests the two transforms and edge cases.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Tests the worker wrapper's use of these functions.
- **`package.json`** — Declares `sharp` as a dependency.

## Notes

- `digestImage` re-encodes into the **same** MIME type it receives. It never converts between formats. The on-disk extension already determines the `Content-Type` that `express.static` will send, so changing the bytes' format without changing the extension would recreate the exact mismatch the upload gates prevent.
- `thumbnailImage` always outputs WebP, regardless of the source format. This is intentional and safe because the thumbnail is stored at a separate key (`.webp` extension), never at the original's URL.
- The pixel-count cap (`limitInputPixels`) is read from `imageConfig()` **at call time**, matching the convention used by every other adapter for env-sensitive values.
- `rotate()` is applied *before* any metadata stripping; without it the orientation tag would be gone and a portrait phone photo would render sideways.
