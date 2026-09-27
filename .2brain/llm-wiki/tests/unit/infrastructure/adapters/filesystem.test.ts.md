---
source: tests/unit/infrastructure/adapters/filesystem.test.ts
sha256: 0be69c837f8f9cb82fe45c66b80e439d89f1ae8a8dee1fb753aaabee22f38385
generated_at: 2026-09-27T16:03:26.298334+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/filesystem.test.ts

## Purpose

Unit tests for the filesystem adapter (`@infrastructure/adapters/filesystem`), covering its three exported functions: `moveFile`, `toPosixPath`, and `reapDirectory`. The suite exists to pin down the adapter's behavioral contracts — particularly the cross-device (EXDEV) fallback path that is the *only* code path exercised on typical Linux deployments where tmpfs and disk live on separate filesystems.

## Key elements

- **`stage(name, contents?)`** — local helper that writes a file into the per-test temp `root` and returns its path.
- **`beforeEach` / `afterEach`** — creates a fresh `mkdtemp` directory per test; tears it down with `rm --recursive` and calls `jest.resetModules()` to clear the dynamic `import()` cache.
- **`describe('moveFile')`** — verifies: source is removed, destination holds identical bytes, overwrite semantics, missing-destination-directory throws, EXDEV fallback (copy-then-unlink) produces the same outcome as the fast path, and non-EXDEV errors (e.g. EACCES) propagate unmodified.
- **`describe('toPosixPath')`** — verifies: all backslashes are replaced (not just the first), idempotency on already-POSIX paths, and no-op on extension-only strings.
- **`describe('reapDirectory')`** — verifies: only files at or before the cutoff are deleted, subdirectories are skipped, dangling symlinks are tolerated (ENOENT on stat), and a missing directory yields `{checked: 0, reaped: 0}` rather than throwing.

## Relationships

- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — listed as a graph neighbor; no direct import or shared symbol is visible in this file.

## Notes

- Every test block uses **dynamic `import()`** after `jest.resetModules()`, which is required for the `jest.doMock` calls in the EXDEV tests to take effect. Static top-level imports would bypass the mock.
- The EXDEV tests mock `node:fs/promises.rename` to reject with a synthetic `EXDEV` error, since the test runner's host may not actually place tmpdir and the repo on different devices.
- `reapDirectory`'s "dangling symlink" test exercises the real-world race where a file is deleted between `readdir` and `stat`; the contract is "skip, don't crash the sweep."
- The `stage` helper writes to a **real** temp directory (not an in-memory FS), so the tests genuinely exercise the OS-level `rename` / `copy` semantics.
