# tests/unit/infrastructure/adapters/image-signatures.test.ts

## Purpose

Unit tests for the magic-byte image identification functions (`identifyImage`, `identifyImageFile`). The file exists to pin down the security contract: identification is purely content-based (magic bytes), ignores extensions and declared MIME types, and reads only the minimal header from disk. It also documents the known boundary — identifying format is not the same as scanning for embedded payloads.

## Key elements

- **`mockReadLengths`** — module-level array recording every `length` argument passed to a file handle's `read`. Prefixed `mock` so Jest's hoisting rule allows the reference inside the factory.
- **`jest.mock('node:fs/promises', …)`** — wraps the real `open` so each returned `FileHandle.read` records the requested byte count before delegating. Used to assert header-only reads.
- **`PNG`, `JPEG`, `WEBP`** — minimal byte-signature fixtures (magic + a few trailing bytes) used across both `describe` blocks.
- **`describe('identifyImage')`** — buffer-level tests: positive identification (PNG/JPEG/WebP), rejection of non-image content (HTML, SVG+script, PHP, shell, plain text), RIFF disambiguation (WAV must not match WebP), short/corrupted buffers, and the polyglot case (valid image + appended payload → still identified as the image).
- **`describe('identifyImageFile')`** — file-level tests using a `mkdtemp` temp directory: real image on disk, disguised `.png` extension with script bytes, nonexistent path (resolves `undefined`, no throw), empty file, and a 20 MB file whose read length is asserted to be ≤ 64 bytes in a single `read` call.

## Relationships

- **`src/infrastructure/adapters/image-signatures.ts`** — the module under test. Provides `identifyImage(buffer)` (synchronous, buffer in → MIME string or `undefined`) and `identifyImageFile(filePath)` (async, opens the file, reads the header, delegates to the same byte-matching logic). The test mocks `node:fs/promises` to observe how `identifyImageFile` interacts with the filesystem without altering the SUT's behavior.

## Notes

- The `mock` prefix on `mockReadLengths` is **not optional**: Jest hoists `jest.mock` calls above imports, so any referenced variable must carry that prefix or the factory will throw a `ReferenceError` at runtime.
- The "reads only the header" test asserts **byte count and call count**, not wall-clock time, deliberately. The comment in the file explains this: a stopwatch threshold would go red on loaded CI while the behavior is still correct, whereas a byte-count assertion can only fail because the code read too much.
- The polyglot test (`PNG + <script>`) is pinned to **return the MIME type**, not `undefined`. This documents the explicit design limit: the function identifies the *format* of the leading bytes; it does not reject or strip trailing data.
- Temp directory is created once in `beforeAll` and removed in `afterAll` with `{ recursive: true, force: true }`; individual tests do not clean up after themselves.
