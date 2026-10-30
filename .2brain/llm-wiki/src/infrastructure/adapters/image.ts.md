---
source: src/infrastructure/adapters/image.ts
sha256: 5e6c4566cd389fc6a2833d94d50e97908aae2819f2062c8a45ca488bb68e1e30
generated_at: 2026-10-29T01:54:46.992923+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image.ts

## Purpose

Thin wrapper around **sharp** that exposes exactly two public transforms — `digestImage` (re-encode a quarantined upload to a size-capped version in the *same* format) and `thumbnailImage` (produce a small WebP derivative). All sharp-specific configuration, safety limits, and encoding logic is confined to this file so the image library can be swapped by rewriting two functions rather than searching the codebase.

## Key elements

- **`ReencodableImageMime`** (type export) — a closed union of MIME strings (`image/png`, `image/jpeg`, `image/webp`) derived at compile time from the `reencodable: true` entries in `images.generated.ts`.
- **`sharp.concurrency(1)` / `sharp.cache(false)`** — module-level side effects. Cap libvips to one thread per process and disable its operation cache, both appropriate for a one-shot decode pipeline that runs inside cluster forks.
- **`decode(input)`** (internal) — sharp constructor with a `limitInputPixels` guard (read from `imageConfig()` at call time) followed by `.rotate()` to bake EXIF orientation into pixels *before* metadata is stripped.
- **`reencode(pipeline, mime)`** (internal) — exhaustive `switch` over the three accepted MIME types; adds a fourth to the union without a branch here is a compile error.
- **`digestImage(input, mime)`** (export) — decode → `resize` (longest-edge cap, `fit: 'inside'`, no upscaling) → re-encode into the *same* MIME → `toBuffer()`.
- **`thumbnailImage(input)`** (export) — decode → `resize` (thumbnail cap) → always `.webp()` → `toBuffer()`. Output is stored at its own URL key, so format mismatch is not a concern.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — imports `imageConfig` to read `NODE_IMAGE_MAX_INPUT_PIXELS`, `NODE_IMAGE_MAX_DIMENSION`, and `NODE_IMAGE_THUMBNAIL_DIMENSION` at call time.
- **`src/infrastructure/adapters/images.generated.ts`** — imports `imageRuleData.formats` to derive the `ReencodableImageMime` type; the set of accepted formats is therefore controlled by the shared rules file, not hardcoded here.
- **`src/infrastructure/adapters/image.worker.ts`** — consumes the two exports to perform digesting inside a worker thread.
- **`src/infrastructure/adapters/image-store.ts`** — consumes the `Buffer` results to persist them.
- **`scenarios/tools/generate-seed-images.ts`** — calls the exports to produce seed fixtures.
- **`package.json`** — declares the `sharp` (and `libvips`) runtime dependency this module imports.
- **`tests/unit/infrastructure/adapters/image.test.ts` / `image.worker.test.ts`** — unit-test the two exports and their worker context.

## Notes

- **Import-time side effect.** `sharp.concurrency(1)` and `sharp.cache(false)` execute the moment this module is loaded. Any test or script that imports this file inherits those settings globally for that process.
- **Same-format re-encode, never convert.** `digestImage` encodes into the *input* MIME. This is intentional: the file extension on disk determines the `Content-Type` that `express.static` will send, and changing the byte format without changing the extension recreates the exact mismatch the upload gate is meant to prevent.
- **`rotate()` precedes metadata strip.** If the EXIF orientation tag were stripped first, there would be nothing for `.rotate()` to read and portrait photos would render sideways.
- **`limitInputPixels` is read at call time**, matching the convention used by every other adapter for env-dependent values; it is not frozen at import.
- **`reencode` uses a `switch`, not a lookup table.** This gives TypeScript's exhaustiveness check a role: an unhandled format is a compile error, not a silent fallthrough to sharp's default encoder.
