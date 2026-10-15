---
source: tests/unit/infrastructure/adapters/filesystem.test.ts
sha256: 3037c997f8d9564cff96a5f6dac3d5e24bc0b786f3d53d676e566ac922949b71
generated_at: 2026-10-15T13:05:47.353036+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/filesystem.test.ts

## Purpose

Unit tests for the filesystem adapter (`@infrastructure/adapters/filesystem`), covering the four exported operations that underpin file uploads, path normalisation, and cleanup: `moveFile`, `toPosixPath`, `reapDirectory`, and `pruneUnreferenced`. Each test uses a per-test temp directory so no test depends on the host's actual filesystem layout.

## Key elements

- **`stage(name, contents)`** – local helper that writes a file into the per-test temp root and returns its path; replaces the need for real upload artifacts.
- **`beforeEach` / `afterEach`** – create a fresh `mkdtemp` root and tear it down; also call `jest.resetModules()` so the dynamic `import()` in each test picks up fresh (or mocked) modules.
- **`describe('moveFile')`** – verifies content preservation, overwrite semantics, missing-destination rejection, and the EXDEV cross-device fallback (mocked `rename` rejection with `code: 'EXDEV'`). Confirms non-EXDEV errors (e.g. `EACCES`) propagate rather than being silently retried as a copy.
- **`describe('toPosixPath')`** – asserts full multi-separator rewrite, idempotence on already-POSIX paths, and passthrough of separator-less names.
- **`describe('reapDirectory')`** – time-based sweep: deletes files older than a cutoff, leaves subdirectories and newer files intact, tolerates dangling symlinks (ENOENT on stat), and returns `{checked: 0, reaped: 0}` for a missing directory instead of throwing.
- **`describe('pruneUnreferenced')`** – set-based sweep: deletes files absent from a `keep` set, respects an optional minimum-age (milliseconds) parameter, leaves subdirectories alone, and returns zero counts for a missing directory.

## Relationships

- **`@infrastructure/adapters/filesystem`** (imported via dynamic `import()` inside each test) – the system under test; all assertions target its four exported functions.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** – listed as a graph neighbor, but no import, shared fixture, or cross-reference is visible in this file. The only shared surface is the common test-runner and project alias configuration.

## Notes

- Every test uses `await import('@infrastructure/adapters/filesystem')` rather than a top-level `import`. This is intentional: it works with `jest.doMock` for the EXDEV cases and pairs with `jest.resetModules()` in `afterEach` so module state never leaks between tests.
- The EXDEV fallback is tested by **mocking** `node:fs/promises.rename` to reject with `code: 'EXDEV'`, because whether the host's tmpdir and the repo live on the same filesystem is environment-dependent. The test forces the branch rather than relying on the CI machine.
- `reapDirectory` and `pruneUnreferenced` both return a `{ checked, reaped }` count pair; `checked` includes entries that were skipped (subdirectories, dangling symlinks), which matters for operational logging.
- The `toPosixPath` idempotence test guards against a double-pass scenario where the helper runs on an already-normalised value.
