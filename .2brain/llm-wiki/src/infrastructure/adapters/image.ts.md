---
source: src/infrastructure/adapters/image.ts
source_sha256: ceca05e9c79264a999377ba524371255765e3c6d48b41343795dee596a54f37c
context_sha256: 55bdd5f6b39bec2ec2390fb6b13f5503ffe31fb733f3d86eb5889b87878b90f8
generated_at: 2026-11-22T02:37:26.007603+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/image.ts

## Purpose
A thin wrapper around `sharp` that turns an uploaded image buffer into safe, public-ready bytes. It exposes two pure Buffer→Buffer transforms built on one shared decode step. All sharp-specific code lives here, so replacing the library means rewriting these functions and nothing else.

## Key elements
- **`ReencodableImageMime`** (type): the MIME types an upload can declare and `digestImage` can re-encode. Derived from the `reencodable: true` entries in `imageRuleData.formats` (generated from `shared/rules/images.yaml`). The code's `reencode` switch handles `image/png`, `image/jpeg` and `image/webp`.
- **`digestImage(input, mime)`**: auto-orients the image, caps its longest edge at `NODE_IMAGE_MAX_DIMENSION` (`fit: 'inside'`, `withoutEnlargement`), and re-encodes it into the same format it was given. This strips EXIF/ICC/XMP metadata and drops anything smuggled in ancillary chunks. Returns `Promise<Buffer>`.
- **`thumbnailImage(input)`**: the same decode and resize, using `NODE_IMAGE_THUMBNAIL_DIMENSION`. Always outputs WebP, because thumbnails are stored at their own key (`/images/thumbs/v1/<stem>.webp`).
- **`decode` (private)**: calls `sharp(input, { limitInputPixels })` with `NODE_IMAGE_MAX_INPUT_PIXELS`, then `.rotate()` to bake in the EXIF orientation before metadata is stripped.
- **`reencode` (private)**: an exhaustive `switch` over `ReencodableImageMime`. Adding a new format without a branch is a compile error.
- **Module-level sharp setup**: `sharp.concurrency(1)` and `sharp.cache(false)`.

## Relationships
- **`config.ts`**: `imageConfig()` supplies `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION` and `NODE_IMAGE_THUMBNAIL_DIMENSION`.
- **`image.worker.ts` and `image-store.ts`**: neighbors in the image pipeline. This file's own comments say a digest runs in every worker copy, or inline in a web copy without a broker. The comments name "promote to `public/`" and "store as a derivative" as the next steps.
- **`scenarios/tools/generate-seed-images.ts`**: a graph neighbor of this file.
- **`package.json`**: declares the `sharp` dependency.
- **Tests**: `image.test.ts` covers this file directly. `image.worker.test.ts` covers the worker.

## Notes
- `digestImage` never converts formats. The file extension on disk determines the `Content-Type` that `express.static` sends, so changing the bytes' format without changing the extension would create a mismatch.
- `limitInputPixels` is a decompression-bomb guard. A small PNG can decode to gigabytes of pixels, and sharp's default cap is 268 MP.
- Config is read at call time (`imageConfig()` inside each function), not frozen at import.
- `sharp.concurrency(1)` limits each process to one libvips thread, so N worker copies don't each run a full thread pool. `sharp.cache(false)` stops one-shot digests from filling memory with cached operations.
- Both functions throw if the input won't decode or exceeds the pixel limit.
- Smaller images are never enlarged.
