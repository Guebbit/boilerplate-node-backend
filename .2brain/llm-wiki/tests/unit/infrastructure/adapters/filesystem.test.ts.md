---
source: tests/unit/infrastructure/adapters/filesystem.test.ts
sha256: a45aa1c67dec578eb66f68d4c0d0a379fbf54ffd336e14274698b96a705c0169
generated_at: 2026-09-23T20:17:07.542681+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/filesystem.test.ts

## Purpose

Unit tests for the three exports of `@infrastructure/adapters/filesystem`: `moveFile`, `toPosixPath`, and `reapDirectory`. The suite exists to lock down filesystem-adapter behavior that the upload pipeline depends on—correct cross-device moves, path normalization, and safe directory cleanup—without requiring a real multi-device host.

## Key elements

- **`stage(name, contents?)`** – Local helper that writes a file under a per-test temp root and returns its path.
- **`moveFile` describe block**
  - Verifies a successful move (source gone, destination has identical bytes).
  - Verifies an existing destination is overwritten, not an error.
  - Verifies a missing destination directory causes a rejection (the "database would record a dangling URL" contract).
  - **`when the two paths are on different filesystems`** – Uses `jest.doMock` to force `rename` to reject with `EXDEV`, then asserts the copy-then-unlink fallback produces the same observable result. A second case confirms a non-EXDEV error (`EACCES`) is *not* swallowed into a retry.
- **`toPosixPath` describe block**
  - All backslashes are replaced, not just the first.
  - Idempotent on already-posix paths.
  - No-op on a bare filename with no separators.
- **`reapDirectory` describe block**
  - Deletes only files whose mtime is at or before the cutoff; recent files survive. Returns `{ checked, reaped }` counts.
  - Subdirectories are skipped entirely (counted in `checked`, never deleted).
  - A non-existent directory resolves to `{ checked: 0, reaped: 0 }` rather than throwing.
- **`afterEach`** – Removes the temp root and calls `jest.resetModules()` so each test's dynamic `import()` picks up a fresh module graph.

## Relationships

- **`tests/unit/scripts/pairing/spec-identity.test.ts`** – Listed as a graph neighbor, but no direct import, shared helper, or behavioral coupling is visible in this file. The two test files are adjacent only in the dependency graph; they exercise different modules.

## Notes

- **Dynamic import pattern:** Every test does `await import('@infrastructure/adapters/filesystem')` after `jest.resetModules()` (run in `afterEach`). This is how `jest.doMock` is scoped per-test without leaking mocks. Forgetting `resetModules` between tests would let one mock bleed into the next.
- **EXDEV is the expected path, not the edge case:** The file's own doc-comment notes that on a typical Linux deployment the temp dir is tmpfs and the target is a disk, so the copy-then-unlink branch is the *primary* path. The mock forces it deterministically so the suite passes even on hosts where both paths happen to share a device.
- **`reapDirectory` third argument** is a label (e.g. `'Test'`) presumably used in log messages; tests pass `'Test'` uniformly.
- **`utimes`** is used to back-date file mtimes so the cutoff logic can be exercised without waiting in real time.
