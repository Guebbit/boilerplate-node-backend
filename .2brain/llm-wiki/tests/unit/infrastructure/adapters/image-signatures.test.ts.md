---
source: tests/unit/infrastructure/adapters/image-signatures.test.ts
sha256: 1a0237df3b39748313959eea705848bc1bfce269b12ec51c69e30010310b6fed
generated_at: 2026-09-23T20:17:18.942544+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-signatures.test.ts

## Purpose

Unit tests for the magic-byte image identification module. The file verifies that `identifyImage` and `identifyImageFile` recognise real image formats (PNG, JPEG, WebP) by their header bytes while rejecting everything else — including disguised payloads, RIFF-adjacent formats, truncated buffers, and corrupted headers. It also pins the file-I/O contract: only the header is read, and the filename/extension is never consulted.

## Key elements

- **`mockReadLengths`** — mutable array that records every `length` argument passed to `FileHandle#read`; used to assert header-only reads. The `mock` prefix is mandatory for Jest hoisting.
- **`jest.mock('node:fs/promises')`** — wraps the real `open` so the returned handle's `read` is intercepted, pushing the requested byte count into `mockReadLengths` before delegating.
- **`PNG`, `JPEG`, `WEBP`** — minimal magic-byte buffers (12, 10, and 16 bytes respectively) used as positive fixtures throughout.
- **`describe('identifyImage')`** — buffer-based tests: valid formats, non-image content (HTML, SVG, PHP, shell, text), RIFF/WAV disambiguation, short-buffer safety, corrupted-header rejection, and polyglot (image + appended script) identification.
- **`describe('identifyImageFile')`** — file-path-based tests using a temp directory: real image on disk, extension ignored for non-image bytes, missing file returns `undefined` (not a throw), empty file, and a 20 MB file that must be read in a single ≤ 64-byte read.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — the sole production import; provides `identifyImage(buffer: Buffer): string | undefined` and `identifyImageFile(path: string): Promise<string | undefined>`. All test assertions target these two functions.
- **`node:fs/promises`** — mocked at the module level so `identifyImageFile`'s internal `open`/`read` calls can be instrumented without touching real disk beyond the temp-directory write helpers.

## Notes

- The polyglot test (valid PNG + trailing `<script>`) is an explicit boundary pin: the module identifies *formats*, it is not a content scanner. If the implementation ever starts rejecting trailing data, this test should change intentionally.
- The header-only read test asserts via `mockReadLengths` byte counts rather than wall-clock timing to avoid flaky CI failures on loaded runners.
- `mockReadLengths` is reset (`length = 0`) inside the single test that reads it; no other test depends on its contents.
- The WEBP fixture is 16 bytes because the format marker (`VP8 `) sits at offset 8 inside the RIFF container; a 4-byte-only check would also match WAV/AVI.
