---
source: tests/unit/infrastructure/adapters/image.test.ts
sha256: a4aeb1a782bdebceb4a686e20a410f90e6151f61d482af3f8043fb109ca6246f
generated_at: 2026-11-08T10:07:17.635296+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.test.ts

## Purpose

Unit tests for the sharp-based image adapter, executed against **real** sharp (no mocking) so that assertions verify actual encoded bytes—format, dimensions, and metadata presence—rather than only that the right methods were called. sharp is native and fast enough that this stays within unit-test scope.

## Key elements

- **`metadataOf(buffer)`** – thin wrapper around `sharp(buffer).metadata()` to keep call-sites clean.
- **`makeImage(format, width, height, withExif?)`** – fixture generator that produces a solid-colour (r 200, g 40, b 10) image in PNG/JPEG/WebP, optionally injecting EXIF (Copyright, Make) via `withExif`.
- **`describe('digestImage')`** – asserts format is preserved (PNG→PNG, JPEG→JPEG, WebP→WebP), EXIF is stripped, longest edge is capped by `NODE_IMAGE_MAX_DIMENSION`, sub-cap images pass through unchanged, the cap is read at **call time** (not import time), non-image bytes are rejected, and inputs exceeding `NODE_IMAGE_MAX_INPUT_PIXELS` (decompression-bomb guard) are rejected.
- **`describe('thumbnailImage')`** – asserts output is always WebP regardless of source format, longest edge is capped by `NODE_IMAGE_THUMBNAIL_DIMENSION`, EXIF is stripped, and non-image bytes are rejected.

## Relationships

- **`src/infrastructure/adapters/image.ts`** – source of `digestImage` and `thumbnailImage`, the two functions under test.
- **`tests/support/environment.ts`** – provides `setEnvironment`, used to swap `NODE_IMAGE_MAX_DIMENSION`, `NODE_IMAGE_THUMBNAIL_DIMENSION`, and `NODE_IMAGE_MAX_INPUT_PIXELS` between test cases without restarting the process.

## Notes

- The "call-time vs import-time" test (`reads NODE_IMAGE_MAX_DIMENSION at call time`) is the only one that changes the env var *between* two calls on the same fixture—this guards against accidental module-level caching of the env value.
- `makeImage` always uses a 3-channel RGB background; tests do not exercise alpha-channel inputs.
- The decompression-bomb test uses a 50×50 (2 500 px) image against a 100-px cap, so the guard must fire at the *decode* step, not at a post-resize check.
