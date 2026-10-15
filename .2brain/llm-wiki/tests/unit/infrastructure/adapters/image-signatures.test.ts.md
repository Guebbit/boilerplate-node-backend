---
source: tests/unit/infrastructure/adapters/image-signatures.test.ts
sha256: a8456eb2a0335be5e663b479835a160aa78690c651e5dcf8c5f12b3fe41a1369
generated_at: 2026-10-15T13:05:56.816482+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-signatures.test.ts

## Purpose

Unit tests for the magic-byte image identification functions (`identifyImage`, `identifyImageFile`). The tests exist to pin down the security contract: identification must be based solely on leading bytes, must reject non-image content regardless of filename or declared MIME, and must read only the header from disk.

## Key elements

- **`identifyImage(buffer)` tests** — Positive cases (PNG, JPEG, WebP magic bytes), negative cases (HTML, SVG-with-script, PHP, shell script, plain text, a `WEBP` string at offset 8 without RIFF), RIFF/WAV disambiguation, short-buffer handling (0–7 bytes), a single-byte-corrupted PNG header, and a polyglot (valid image + appended script).
- **`identifyImageFile(path)` tests** — On-disk positive identification, extension-ignoring (`disguised.png` containing a script), missing-file handling (resolves `undefined` rather than throwing), empty file, and a header-only read assertion.
- **`mockReadLengths` + `jest.mock('node:fs/promises')`** — Wraps `fs.open` so every `handle.read` call records the requested `length`. Used to assert that only one read of ≤ 64 bytes occurs against a 20 MB file, proving no full-file load.
- **`PNG`, `JPEG`, `WEBP`** — Minimal byte sequences (magic + a few following bytes) used as fixtures throughout.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — The module under test. This file imports `identifyImage` and `identifyImageFile` from it and asserts their return values and side-effect-free behavior.

## Notes

- The `mockReadLengths` array is named with the `mock` prefix specifically because Jest's hoisting rules only allow out-of-scope references inside `jest.mock` factories when the variable starts with `mock`.
- The header-read test asserts on **byte count observed** rather than wall-clock time, deliberately avoiding flaky timing thresholds on loaded CI runners.
- The polyglot test (image + `<script>` appended) documents an explicit design boundary: the function identifies the *format*, it does not scan for embedded payloads. A reviewer changing that behavior should update or remove that test case.
- WebP identification requires matching `RIFF` at offset 0 **and** `WEBPVP8 ` at offset 8; a test specifically guards against a RIFF-only check that would also accept WAV/AVI.
