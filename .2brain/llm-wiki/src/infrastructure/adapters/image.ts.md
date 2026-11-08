---
source: src/infrastructure/adapters/image.ts
sha256: 5e6c4566cd389fc6a2833d94d50e97908aae2819f2062c8a45ca488bb68e1e30
generated_at: 2026-11-08T03:19:55.277412+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.ts

## Purpose

Wraps the `sharp` library behind two pure `Buffer → Buffer` transforms (`digestImage`, `thumbnailImage`). All sharp-specific code lives in this single file so that swapping the image library is a two-function rewrite, not a codebase-wide search.

## Key elements

- **`ReencodableImageMime`** (exported type) — derived from `imageRuleData.formats`; the closed set of MIME types (`image/png`, `image/jpeg`, `image/webp`) that `digestImage` may re-encode into.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** — module-level configuration that caps libvips to one thread per fork and disables the repeated-operation cache (pointless for one-shot digests, wastes memory in multi-fork deployments).
- **`decode`** (internal) — builds a `Sharp` pipeline from a raw buffer with a `limitInputPixels` ceiling (read from `imageConfig()` at call time) and applies auto-orientation via `rotate()`.
- **`reencode`** (internal) — `switch` over the `ReencodableImageMime` union; exhaustive by construction, so a new format without a branch is a compile error.
- **`digestImage(input, mime)`** (exported) — decodes, resizes (longest edge capped, `fit: 'inside'`, no upscaling), re-encodes into the *same* MIME as input, returns `Promise<Buffer>`. Drops EXIF/ICC/XMP and neutralises ancillary-chunk smuggling via the decode/encode round-trip.
- **`thumbnailImage(input)`** (exported) — decodes, resizes to the thumbnail dimension, always encodes as WebP regardless of source format, returns `Promise<Buffer>`.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — source of `imageConfig()`, which supplies `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION`, and `NODE_IMAGE_THUMBNAIL_DIMENSION` at call time.
- **`src/infrastructure/adapters/image.worker.ts`** — invokes `digestImage` / `thumbnailImage` inside a worker thread so the sharp work is offloaded from the event loop.
- **`src/infrastructure/adapters/image-store.ts`** — persists the `Buffer` outputs from these two functions into the image store.
- **`scenarios/tools/generate-seed-images.ts`** — calls the same transforms to pre-generate seed/thumbnail images for dev fixtures.
- **`tests/unit/infrastructure/adapters/image.test.ts`** — unit tests for `digestImage` and `thumbnailImage` behaviour (format, dimensions, error paths).
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — tests the worker wrapper that schedules these functions.
- **`package.json`** — declares the `sharp` dependency consumed here.

## Notes

- `digestImage` **never converts format**: input MIME = output MIME. Changing the bytes' format without matching the on-disk extension would desync `Content-Type` from what `express.static` sends.
- `thumbnailImage` **always outputs WebP**, independent of the source format, because the thumbnail lives at its own key (`/images/thumbs/v1/<stem>.webp`) and nothing downstream infers a content type from the original's extension.
- `limitInputPixels` is read **at call time** via `imageConfig()`, not frozen at import — consistent with the adapter convention for env-driven limits.
- `rotate()` runs **before** the metadata strip; if it ran after, the EXIF orientation tag would already be gone and a portrait phone photo would render sideways.
- The `reencode` switch is intentionally over a closed union rather than a lookup map, so TypeScript's exhaustiveness check catches a missing branch at compile time instead of silently falling through to sharp's default encoder.
