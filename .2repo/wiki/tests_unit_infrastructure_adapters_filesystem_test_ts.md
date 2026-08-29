# tests/unit/infrastructure/adapters/filesystem.test.ts

## Purpose

Unit tests for `moveFile` from `@infrastructure/adapters/filesystem`, verifying both the happy path (rename) and the cross-device fallback (copy-then-unlink on EXDEV). The EXDEV case is not an edge case here — on a typical Linux host the temp dir is tmpfs and the public dir is a real disk, so the fallback is the production path.

## Key elements

- **`stage(name, contents?)`** — local helper that writes a file under the per-test temp root and returns its path. Used to create source and destination fixtures.
- **`beforeEach` / `afterEach`** — creates a fresh `mkdtemp` directory per test; tears it down recursively and calls `jest.resetModules()` to clear the dynamic-import cache.
- **`describe('moveFile')`** — top-level suite covering:
  - Basic move (contents preserved, source removed).
  - Overwrite of an existing destination.
  - Rejection when the destination directory does not exist (contract: must throw, not silently no-op).
- **`describe('when the two paths are on different filesystems')`** — forced-EXDEV suite:
  - Mocks `rename` to reject with `code: 'EXDEV'`, asserts the fallback produces the same observable result.
  - Mocks `rename` to reject with `code: 'EACCES'`, asserts the error is *not* swallowed by the fallback and propagates to the caller.

## Relationships

- **`tests/unit/scripts/spec-identity.test.ts`** — listed as a graph neighbor (likely shares the same adapter module under test or common test infrastructure), but no direct import or runtime dependency on it is visible in this file.

## Notes

- Every test uses **dynamic `await import(...)`** rather than a top-level import. This is required because `jest.doMock` + `jest.resetModules()` only take effect on subsequent imports; a static import would be cached before the mock is installed.
- The EXDEV mock spreads `jest.requireActual('node:fs/promises')` and overrides only `rename`, so `readFile`, `writeFile`, `copyFile`, etc. remain real. This keeps the test exercising the actual copy-then-unlink logic rather than mocking the entire module.
- The "destination directory does not exist" test is intentional: a silent no-op would cause the database to record a URL pointing at bytes that were never written. The throw is a safety contract, not a limitation.
