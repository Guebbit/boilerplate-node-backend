---
source: tests/unit/infrastructure/adapters/image.test.ts
sha256: a4aeb1a782bdebceb4a686e20a410f90e6151f61d482af3f8043fb109ca6246f
generated_at: 2026-10-15T13:06:24.317309+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image.test.ts

## Purpose

Unit tests for the `digestImage` and `thumbnailImage` functions. Unlike typical adapter tests that mock the native `sharp` dependency, this file exercises **real sharp** against **real encoded buffers**, asserting properties that only the output bytes can prove: format identity, exact dimensions after resize, and whether EXIF metadata was actually stripped. The file's own header notes that a mock could only verify sharp was *asked* to do something, not that it happened.

## Key elements

- **`metadataOf(buffer)`** — thin wrapper around `sharp(buffer).metadata()` so callers never inline the async cast.
- **`makeImage(format, width, height, withExif?)`** — factory that builds a solid-colour (200, 40, 10) image via sharp's `create` API; conditionally attaches fake EXIF (`Copyright`, `Make`) before encoding to a Buffer.
- **`describe('digestImage')`** — 7 test cases covering: format preservation (png/jpeg/webp), EXIF stripping, longest-edge capping via `NODE_IMAGE_MAX_DIMENSION`, no upscaling of already-small images, call-time (not import-time) env reading, rejection of undecodable bytes, and rejection of inputs exceeding `NODE_IMAGE_MAX_INPUT_PIXELS` (decompression-bomb guard).
- **`describe('thumbnailImage')`** — 4 test cases covering: output is always WebP regardless of source format, longest-edge capping via `NODE_IMAGE_THUMBNAIL_DIMENSION`, EXIF stripping, and rejection of undecodable bytes.

## Relationships

- **`src/infrastructure/adapters/image.ts`** — the module under test; this file imports `digestImage` and `thumbnailImage` and asserts on their return values.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in individual tests to set `NODE_IMAGE_MAX_DIMENSION`, `NODE_IMAGE_THUMBNAIL_DIMENSION`, and `NODE_IMAGE_MAX_INPUT_PIXELS` to controlled values without touching the real process environment.

## Notes

- The `withExif` parameter on `makeImage` uses a conditional pipeline (`pipeline.withExif(...) : pipeline`) rather than a separate code path, so the non-EXIF path still exercises the same encoding chain.
- One test explicitly changes `NODE_IMAGE_MAX_DIMENSION` between two calls on the *same* input buffer to lock in the contract that the cap is read at call time; regressing to a captured-at-import value would make the second assertion fail.
- The decompression-bomb test creates a 50×50 image (2 500 px) and sets `NODE_IMAGE_MAX_INPUT_PIXELS` to 100, so the guard fires *before* any resize — the test is about the decode gate, not the output size.
