# src/infrastructure/adapters/image.ts

## Purpose

Thin wrapper around `sharp` that exposes exactly two pure `Buffer → Buffer` transforms — `digestImage` and `thumbnailImage`. It exists to keep every sharp-specific detail (decode options, resize config, encode calls, pixel-limit safety) isolated behind this single file, so swapping the imaging library later means rewriting two functions rather than searching the codebase.

## Key elements

- **`ReencodableImageMime`** — closed union of `'image/png' | 'image/jpeg' | 'image/webp'`, the only formats `digestImage` will encode into.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** — module-level calls that cap libvips to one thread per cluster fork and disable its op-cache (a one-shot digest never benefits from caching).
- **`decode(input)`** — internal; runs `sharp(input, { limitInputPixels })` then `.rotate()` (auto-orient from EXIF before any metadata strip).
- **`reencode(pipeline, mime)`** — internal; a `switch` over `ReencodableImageMime` that calls `.png()`, `.jpeg()`, or `.webp()`. Exhaustiveness is compile-checked: adding a fourth variant to the union without a branch is a type error.
- **`digestImage(input, mime)`** — exported; decode → resize (longest edge ≤ `NODE_IMAGE_MAX_DIMENSION`, default 2048, `fit: 'inside'`, no upscaling) → re-encode into the *same* `mime` as input. Drops all metadata (EXIF/ICC/XMP) as a side effect of the round-trip.
- **`thumbnailImage(input)`** — exported; decode → resize (longest edge ≤ `NODE_IMAGE_THUMBNAIL_DIMENSION`, default 320) → always WebP. Output lives at its own `.webp` key, so no `Content-Type` mismatch with the original.
- **`maxInputPixels()` / `maxDigestDimension()` / `maxThumbnailDimension()`** — internal; read `NODE_IMAGE_*` env vars at call time (not import time) via `environmentNumber`.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, the sole source of the three tunable limits.
- **`src/infrastructure/adapters/image.worker.ts`** — imports `digestImage` and `thumbnailImage` to run them off the event loop inside a worker thread.
- **`scripts/backfill-image-thumbnails.ts`** — calls `thumbnailImage` in bulk to generate missing derivative thumbnails.
- **`tests/unit/infrastructure/adapters/image.test.ts`** — unit-tests `digestImage` / `thumbnailImage` behavior.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — tests the worker wrapper, exercising these functions through the worker boundary.
- **`package.json`** — declares the `sharp` dependency this file imports.

## Notes

- **Format is never changed by `digestImage`.** The output mime equals the input mime. This is deliberate: the file extension on disk dictates the `Content-Type` `express.static` will send, so silently converting bytes would recreate the exact mismatch the upload signature gates prevent.
- **`thumbnailImage` always emits WebP** regardless of the source format, because the thumbnail is stored at its own `.webp` URL — no downstream code infers `Content-Type` from the original's extension.
- **Pixel limit ≠ byte limit.** A 5 MB PNG can decode to gigabytes of raw pixels; `limitInputPixels` (default 50 Mpx) is the actual decompression-bomb guard, applied at the `sharp()` constructor before any resize.
- **EXIF auto-orient (`.rotate()`) must run before the metadata strip**, or the orientation tag is gone and portrait photos render sideways.
- **Env reads are deferred to call time** (like `maxUploadBytes` in `storage.ts`), so config changes take effect without a process restart.
