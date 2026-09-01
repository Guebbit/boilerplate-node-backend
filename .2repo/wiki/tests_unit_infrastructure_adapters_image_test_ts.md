# tests/unit/infrastructure/adapters/image.test.ts

## Purpose

Unit tests for the image adapter (`digestImage` and `thumbnailImage`) that use the **real** `sharp` native module against generated fixture buffers. The goal is to assert properties of the actual encoded output bytes (format, dimensions, EXIF presence) rather than verifying that mocked methods were called.

## Key elements

- **`digestImage` describe block** — verifies:
  - Format preservation (PNG → PNG, JPEG → JPEG, WebP → WebP)
  - EXIF metadata is stripped
  - Longest edge is capped by `NODE_IMAGE_MAX_DIMENSION`, with proportional scaling
  - Images already below the cap pass through unchanged
  - The env var is read at **call time**, not import time (two successive calls with different values)
  - Invalid bytes reject with a thrown error
  - Decompression-bomb guard: input whose decoded pixel count exceeds `NODE_IMAGE_MAX_INPUT_PIXELS` rejects
- **`thumbnailImage` describe block** — verifies:
  - Output is always WebP regardless of source format
  - Longest edge capped by `NODE_IMAGE_THUMBNAIL_DIMENSION`
  - EXIF stripped
  - Invalid bytes reject
- **`makeImage(format, width, height, withExif?)`** — builds a solid-colour (RGB 200/40/10) fixture via `sharp.create`, optionally injecting EXIF (`Copyright`, `Make`).
- **`metadataOf(buffer)`** — thin wrapper around `sharp(buffer).metadata()` for readability.
- **`afterEach` env restore** — snapshots `process.env` before the suite and restores it after every test so env-var tests don't leak.

## Relationships

- **`src/infrastructure/adapters/image.ts`** — sole production dependency under test; the file imports `digestImage` and `thumbnailImage` and exercises their contract.
- **`sharp`** — used directly (not mocked) both by the tested code and by the test helpers (`metadataOf`, `makeImage`).

## Notes

- The file intentionally avoids mocking `sharp` because the assertions target decoded output properties (actual pixel dimensions, presence/absence of EXIF) that a mock cannot produce. Sharp is native and fast enough that this stays a unit test, not an integration test.
- Dimension-capping tests set the relevant `NODE_IMAGE_*` env vars **inside** the test body, relying on call-time reads. The dedicated "call time, not import time" test makes that contract explicit.
- The decompression-bomb test uses a 50×50 image against a cap of 100 pixels, so the guard triggers purely on the pixel-count check, not on format or size.
