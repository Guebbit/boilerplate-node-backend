---
source: tests/unit/infrastructure/adapters/document-store.test.ts
sha256: 839d202f424817cfd509e589e3d59a00da95cf4a468563b634101f79003fb236
generated_at: 2026-10-15T13:05:12.619227+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/document-store.test.ts

## Purpose

Unit tests for the document-store adapter, verifying its three observable guarantees on a real (temporary) directory: that writes are atomic and names are strictly validated, and that the reaper deletes exclusively by modification-time age.

## Key elements

- **`beforeEach` / `afterEach` hooks** — create a unique `mkdtemp` directory, point `NODE_DOCUMENT_STORE_PATH` at it via `setEnvironment`, and remove it after each test.
- **`describe('readDocument and writeDocument')`**
  - Round-trip: writes a buffer, reads it back byte-for-byte.
  - Missing document: `readDocument` resolves to `undefined`.
  - First-write directory creation: deletes the root, then confirms `writeDocument` recreates the directory implicitly.
  - Concurrency / atomicity: two simultaneous `writeDocument` calls to the same name leave exactly one file and no temp artifact.
  - Name validation (parameterized `it.each`): path-traversal sequences, sub-directory names, wrong extensions, empty strings, over-long names, and URL-encoded slashes are all rejected — `readDocument` returns `undefined`, `writeDocument` throws `'Not a storable'`, and the directory remains empty.
- **`age(name, days)`** — local helper that calls `fs.utimes` to backdate a file's mtime for reaper tests.
- **`describe('reapDocuments')`**
  - Splits files by mtime relative to the supplied window (30 days): older files are deleted, newer ones kept; returns `{ checked, reaped }` counts.
  - No-op when the store directory does not exist: resolves `{ checked: 0, reaped: 0 }`.

## Relationships

- **`src/infrastructure/adapters/document-store.ts`** — the module under test; this file imports `reapDocuments`, `readDocument`, and `writeDocument`.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in `beforeEach` to inject `NODE_DOCUMENT_STORE_PATH` so the adapter resolves to the test's temp directory.

## Notes

- Tests operate on the real filesystem (`tmpdir`) rather than mocking I/O, which is necessary to assert atomicity (no leftover temp files) and mtime-based reaping.
- The name-validation cases include a URL-encoded traversal (`..%2f.pdf`) in addition to a literal `../`, signalling the store treats names opaquely rather than decoding them.
- `reapDocuments` is tested with files written directly via `fs.writeFile` (bypassing `writeDocument`) to isolate the mtime logic from write-path concerns.
