---
source: tests/unit/infrastructure/adapters/image.test.ts
sha256: 961ed9f8c5812dd7d25d2bb46cf88aadc637f29c102c7eb59e5d96c7e6874315
generated_at: 2026-09-23T20:17:41.570261+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.test.ts

## Purpose

Unit tests for the `digestImage` and `thumbnailImage` functions from the sharp adapter. Instead of mocking sharp, the tests generate real encoded buffers (via sharp's `create` pipeline) and assert on the actual output format, dimensions, and metadata presence. This ensures the adapter truly produces valid images rather than merely calling the right sharp methods.

## Key elements

- **`makeImage(format, width, height, withExif?)`** — Test-fixture builder. Creates a solid-colour (r:200 g:40 b:10) image of the given size and format using sharp's `create` source; optionally injects EXIF (Copyright, Make) via `withExif`. Returns a `Buffer`.
- **`metadataOf(buffer)`** — Thin wrapper around `sharp(buffer).metadata()` so callers get a single-async-call interface for assertions.
- **`digestImage` suite** — Verifies:
  - Output format matches input MIME (png/jpeg/webp), no silent conversion.
  - EXIF metadata is stripped.
  - Longest edge is capped at `NODE_IMAGE_MAX_DIMENSION` (aspect preserved).
  - Images already under the cap are untouched.
  - `NODE_IMAGE_MAX_DIMENSION` is read at *call time*, not import time.
  - Invalid bytes reject.
  - Inputs exceeding `NODE_IMAGE_MAX_INPUT_PIXELS` reject (decompression-bomb guard).
- **`thumbnailImage` suite** — Verifies:
  - Output is always WebP regardless of source format.
  - Longest edge capped at `NODE_IMAGE_THUMBNAIL_DIMENSION`.
  - EXIF stripped.
  - Invalid bytes reject.

## Relationships

- **`src/infrastructure/adapters/image.ts`** — The system under test. The test imports `digestImage` and `thumbnailImage` from this module and asserts on their encoded `Buffer` outputs.
- **`sharp`** (npm package) — Imported directly to create fixtures (`create` source, `toBuffer`) and to read metadata for assertions. Not mocked.

## Notes

- `process.env` is snapshotted before the suite and restored in `afterEach`; tests that set env vars (`NODE_IMAGE_MAX_DIMENSION`, `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_THUMBNAIL_DIMENSION`) rely on this cleanup.
- The "reads at call time" test deliberately changes the env var *between* two calls on the same input buffer to prove the value isn't captured at module-load time.
- The decompression-bomb test uses a 50×50 image (2 500 px) against a cap of 100 px — the image is small enough to encode quickly but large enough to trip the pixel-count guard.
