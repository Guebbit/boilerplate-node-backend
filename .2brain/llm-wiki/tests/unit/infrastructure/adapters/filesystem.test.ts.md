---
source: tests/unit/infrastructure/adapters/filesystem.test.ts
sha256: 424eae79ce6236d87ee96b96eb91ecd372b019e0e4788521c31faa8e06a6c229
generated_at: 2026-11-08T10:06:39.096299+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/filesystem.test.ts

## Purpose

Unit tests for the filesystem adapter (`@infrastructure/adapters/filesystem`), covering file moving with cross-device fallback, path normalisation, directory reaping, unreferenced-file pruning, and atomic writes. Each function is tested for its happy path, error contract, and edge cases (missing directories, dangling symlinks, subdirectories).

## Key elements

- **`moveFile` tests** — Verifies source-removal + destination-integrity, overwrite semantics, and that a missing destination directory throws. A nested `describe` forces the EXDEV path by mocking `rename` to reject with `code: 'EXDEV'`, confirming the copy-then-unlink fallback produces identical results and that non-EXDEV errors (e.g. `EACCES`) still surface.
- **`toPosixPath` tests** — Confirms all backslashes are rewritten (not just the first), idempotence on already-posix paths, and no-op on separator-free strings.
- **`reapDirectory` tests** — Checks cutoff-based deletion, that subdirectories are skipped, that dangling symlinks are tolerated (counted but not fatal), and that a non-existent directory yields `{ checked: 0, reaped: 0 }` rather than throwing.
- **`pruneUnreferenced` tests** — Validates that only files absent from the `keep` set are deleted, the optional minimum-age parameter preserves young files, and subdirectories / missing directories are handled gracefully.
- **`writeFileAtomically` tests** — Confirms the target is updated and no temp file remains on success; on mid-write failure the prior file is untouched and the temp file is cleaned up; the write error is rethrown even when no temp file was created.
- **`stage` helper** — Creates a named file under the per-test temp root and returns its path.

## Relationships

No direct import or reference to `tests/unit/scripts/pairing/spec-identity.test.ts` appears in this file. Both files share the same `jest.doMock` + dynamic `import()` mocking pattern for `node:fs/promises`, suggesting a project-wide testing convention for filesystem-dependent modules.

## Notes

- Every test obtains the module under test via `await import('@infrastructure/adapters/filesystem')` after (optionally) calling `jest.doMock`. This is intentional: `jest.doMock` only affects *subsequent* imports, so the dynamic import picks up the mock.
- `afterEach` explicitly calls `jest.dontMock('node:fs/promises')` **before** `jest.resetModules()`. The comment explains that `doMock` would otherwise outlive `resetModules` and leak into later `describe` blocks.
- The EXDEV test is forced via a mock rather than relying on the host's actual filesystem layout, because "on a normal Linux deployment [the cross-device branch] is the only branch that ever runs" — but CI containers may share one device.
- `reapDirectory` and `pruneUnreferenced` both accept a human-readable label (e.g. `'Test'`) as a parameter, presumably for log messages in production; tests pass a constant.
- All tests operate on a fresh `mkdtemp` directory torn down in `afterEach`, so there is no shared state between test cases.
