---
source: tests/unit/infrastructure/adapters/export-store.test.ts
sha256: 2391eb6b863af449d0237c7bcdae105d9a6d4ddad6cc70672534dc886f1319f0
generated_at: 2026-11-08T10:06:24.850241+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/export-store.test.ts

## Purpose

Unit tests for the export-store adapter, verifying its three core invariants: name validation (only a strict `*.json` shape is accepted), write atomicity (a failed or in-progress build is invisible and leaves no residue), and age-based reaping. Tests run against a real temp directory rather than mocks.

## Key elements

- **`readBack(name)`** — test helper that opens a stored export and consumes the stream to a string, or returns `undefined` if none exists.
- **`age(name, days)`** — test helper that backdates a file's mtime via `fs/promises.utimes`, used to simulate elapsed time for reap tests.
- **`describe('writeExport and openExport')`** — covers round-trip stream append, `undefined` for missing names, auto-creation of the store directory, atomic failure (no file left, original error rethrown), mid-build invisibility, and rejection of unsafe names (path traversal, subdirectory, wrong extension, empty, over-length, percent-encoded traversal).
- **`describe('removeExport')`** — verifies successful deletion returns `true` and already-absent names return `false`.
- **`describe('reapExports')`** — verifies deletion by mtime window (returns `{ checked, reaped }` counts) and a no-op on an empty/missing directory.

## Relationships

- **`src/infrastructure/adapters/export-store.ts`** — the module under test. Imports `writeExport`, `openExport`, `removeExport`, `reapExports`.
- **`tests/support/environment.ts`** — imports `setEnvironment` to point `NODE_ACCOUNT_EXPORT_STORE_PATH` at the per-test temp directory created in `beforeEach`.

## Notes

- Name validation is the security boundary: any name that isn't a plain `*.json` filename is rejected on all three operations (`openExport` → `undefined`, `writeExport` → throws `'Not a storable…'`, `removeExport` → `false`). No path is ever constructed for an invalid name.
- Atomicity is stronger than "delete on failure": the file is invisible to concurrent readers *during* the build, not merely absent after it.
- `reapExports` deletes strictly by modification time; creation time is irrelevant.
- Tests use a real filesystem (`mkdtemp` + `rm`), so they exercise actual `fs/promises` calls. There are no filesystem mocks.
- The `afterEach` cleanup uses `rm(root, { recursive: true, force: true })`; the `force` flag matters because some tests delete the root mid-test.
