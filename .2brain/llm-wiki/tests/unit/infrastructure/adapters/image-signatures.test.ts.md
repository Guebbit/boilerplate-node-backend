---
source: tests/unit/infrastructure/adapters/image-signatures.test.ts
sha256: 47b0aa2f0e1a89476a092007db765c8f7cce575d7f8e11c2b504d1f868cdfba4
generated_at: 2026-11-08T10:06:50.492611+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-signatures.test.ts

## Purpose

Unit tests for the magic-byte image identification functions (`identifyImage`, `identifyImageFile`) and the `ACCEPTED_UPLOAD_MIMETYPES` set. The focus is on content-based verification that ignores client-supplied claims (MIME headers, file extensions), covering both valid images and adversarial payloads.

## Key elements

- **`identifyImage` tests** — Feed raw buffers of PNG, JPEG, WebP and a battery of non-image payloads (HTML, SVG+script, PHP, shell, truncated headers, corrupted headers, RIFF/WAV) and assert correct MIME detection or `undefined`. Includes a polyglot case (valid image + appended script) that confirms the function identifies the format without acting as a scanner.
- **`identifyImageFile` tests** — Same logic exercised through a real temp file on disk. Verifies extension is ignored, unreadable files return `undefined` (not a throw), empty files are handled, and—via a mocked `fs/promises.open`—that exactly one header-sized read (≤ 64 bytes) is issued rather than loading the whole file.
- **`ACCEPTED_UPLOAD_MIMETYPES` tests** — Confirms the set contains every `ACCEPTED_UPLOAD_TYPES` entry plus the `image/jpg` alias, contains nothing else, and that each contract type is actually identifiable by `identifyImage`.
- **`mockReadLengths`** — Module-level array populated by the `jest.mock('node:fs/promises')` factory, which wraps `FileHandle.read` to record the `length` argument. Used to assert byte-level read size.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — The system under test. Imports `identifyImage`, `identifyImageFile`, and `ACCEPTED_UPLOAD_MIMETYPES`.
- **`@api/upload-types`** — Imports `ACCEPTED_UPLOAD_TYPES` as the source-of-truth contract list against which the MIME set is validated.

## Notes

- `mockReadLengths` is prefixed `mock` specifically because Jest hoists the `jest.mock` factory above imports; any out-of-scope reference in that factory must match the `mock`/`__mock` naming convention or the hoist fails.
- The "reads only the header" test asserts the **byte count of the read call** rather than elapsed time, deliberately avoiding wall-clock flakiness on loaded CI runners.
- The polyglot test is intentionally permissive: it documents that `identifyImage` is a format identifier, not a content-security scanner. Trailing bytes after a valid signature are expected to pass.
- File-based tests use `mkdtemp`/`rm` on a real temp directory; they do not mock `writeFile`. Only `open`/`read` are intercepted.
