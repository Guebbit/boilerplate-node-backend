---
source: tests/unit/infrastructure/adapters/export-store.test.ts
sha256: 2391eb6b863af449d0237c7bcdae105d9a6d4ddad6cc70672534dc886f1319f0
generated_at: 2026-10-15T13:05:32.486081+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/export-store.test.ts

## Purpose
Unit tests for the export-store adapter. They verify the on-disk contract of the store: stream-based read/write round-trips, atomicity (a failed build leaves no file), strict name validation, explicit removal, and age-based reaping.

## Key elements

- **`readBack(name)`** – Helper that calls `openExport` and consumes the stream to a string, returning `undefined` when no export exists.
- **`age(name, days)`** – Helper that backdates a stored file's modification time via `utimes`, enabling reap-window tests.
- **`describe('writeExport and openExport')`** – Covers:
  - Ordered multi-append round-trip.
  - `undefined` for a never-stored name.
  - Directory auto-creation on first write (fresh-volume scenario).
  - Atomicity: a mid-build throw rethrows and leaves an empty directory.
  - Visibility: a concurrent `openExport` during a build sees nothing until the build resolves.
  - Name validation (parameterized over `../etc/passwd`, `a/b.json`, `export.txt`, `''`, an over-length name, `..%2f.json`): open, write, and remove all reject or no-op without touching the filesystem.
- **`describe('removeExport')`** – Confirms deletion returns `true` and the file is gone; confirms a missing name returns `false`.
- **`describe('reapExports')`** – Confirms files older than the window are deleted and newer ones kept, and that a never-written store is a no-op (`{ checked: 0, reaped: 0 }`).

## Relationships

- **`src/infrastructure/adapters/export-store.ts`** – The system under test. The file imports `openExport`, `reapExports`, `removeExport`, and `writeExport` from this module.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used in `beforeEach` to point `NODE_ACCOUNT_EXPORT_STORE_PATH` at a per-test temp directory.

## Notes

- Each test runs against its own `mkdtemp` directory; `afterEach` removes it. There is no cross-test state.
- The atomicity and visibility tests rely on the store writing to a temp filename and renaming—asserted implicitly by checking the directory is empty mid-build and that `openExport` returns `undefined` before the build resolves.
- Name-validation cases are chosen to probe traversal, subpaths, wrong extension, empty string, length, and percent-encoding; the test asserts *three* operations (open, write, remove) for each bad name to ensure none can escape the store directory.
