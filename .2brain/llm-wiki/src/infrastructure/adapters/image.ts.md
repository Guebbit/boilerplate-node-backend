---
source: src/infrastructure/adapters/image.ts
sha256: 3f327d6808a3087492f1d896df85d13ef0b710782b1be17a80ae9f1703864948
generated_at: 2026-09-23T17:39:41.411182+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.ts

## Purpose

Wraps the `sharp` library behind two pure `Buffer → Buffer` transforms (`digestImage`, `thumbnailImage`) so that the rest of the codebase never touches sharp's API directly. Swapping the image library means rewriting this file only. Also centralises the decode safety limits (pixel ceiling, auto-orient) shared by both transforms.

## Key elements

- **`ReencodableImageMime`** — Closed union type (`'image/png' | 'image/jpeg' | 'image/webp'`) constraining which formats the encoder will accept.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** — Module-level side effects executed on import; cap libvips to one thread per fork and disable its op-cache (pointless for one-shot digests).
- **`decode(input)`** _(private)_ — Creates a sharp pipeline with `limitInputPixels` from `NODE_IMAGE_MAX_INPUT_PIXELS` and `.rotate()` (bakes EXIF orientation into pixels before metadata is stripped).
- **`reencode(pipeline, mime)`** _(private)_ — `switch` over the three `ReencodableImageMime` values; a fourth format added to the union without a branch is a compile error.
- **`digestImage(input, mime)`** _(exported)_ — Decode → resize to `NODE_IMAGE_MAX_DIMENSION` (default 2048, `fit: 'inside'`, no enlargement) → re-encode to the **same** mime the caller passed in. Returns the public-ready bytes.
- **`thumbnailImage(input)`** _(exported)_ — Decode → resize to `NODE_IMAGE_THUMBNAIL_DIMENSION` (default 320) → encode as **WebP unconditionally**. Returns thumbnail bytes.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Supplies `environmentNumber`, the single accessor for `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION`, and `NODE_IMAGE_THUMBNAIL_DIMENSION`. Read at call time, not import time.
- **`src/infrastructure/adapters/image.worker.ts`** — Hosts these two functions in a dedicated worker thread so the event loop isn't blocked during decode/encode.
- **`src/infrastructure/adapters/image-store.ts`** — Consumes the returned buffers and writes them to the public store (`public/` originals and `/images/thumbs/v1/` thumbnails).
- **`scenarios/tools/generate-seed-images.ts`** — Development/scenario script that calls the same transforms to pre-generate seed images.
- **`tests/unit/infrastructure/adapters/image.test.ts`** — Unit-tests `digestImage` and `thumbnailImage` (format preservation, size capping, error paths).
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Verifies the worker-thread wrapper around these functions.
- **`package.json`** — Declares the `sharp` dependency this file imports.

## Notes

- **Format is never silently converted.** `digestImage` re-encodes into the _same_ mime the caller declares, because the file extension on disk determines the `Content-Type` `express.static` sends. Mismatching bytes and extension is the exact failure mode the upload gates prevent.
- **`rotate()` ordering matters.** It runs before the metadata strip; if it ran after, the EXIF orientation tag would already be gone and a portrait phone photo would output sideways.
- **`limitInputPixels` is the decompression-bomb guard.** Sharp's default cap (268 MP) is far too permissive for a 5 MB PNG that can decode to gigabytes of raw pixels. The env-tuned ceiling is checked _before_ any resize.
- **Module-level sharp config is global per process.** The `concurrency`/`cache` calls affect every sharp pipeline in the same worker, not just this module.
