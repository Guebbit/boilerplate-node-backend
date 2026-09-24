---
source: tests/support/file-sandbox.ts
sha256: 0aa68cf6315f0513add7b2241acce3ff27e24c659d9dca8ec03c4277448b0f3b
generated_at: 2026-09-23T20:11:00.985970+00:00
model: ollama:qwen3.8:27b
---

# tests/support/file-sandbox.ts

## Purpose

Redirects every file-writing application setting (`public/`, `quarantine/`, staging, etc.) into a per-test-file directory under a jest-instance sandbox root, so integration tests never write onto the developer's real directories. It also provides the scan-and-report primitives that global teardown uses to fail a run when a test left files behind.

## Key elements

- **`FILE_SANDBOX_ROOT_VARIABLE`** (`'NODE_TEST_FILES_ROOT'`) — env-var name that carries the sandbox root from `globalSetup` into the workers.
- **`SANDBOXED_VARIABLES`** — constant mapping of app env vars (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_INVOICE_CACHE_PATH`, `NODE_MAIL_SPOOL_PATH`) to their sandbox subdirectory names.
- **`sandboxDirectory(root, testPath)`** — returns the sandbox subdirectory for a test file, naming it by the repo-relative path with separators flattened to `__`.
- **`applyFileSandbox(testPath)`** — sets every sandboxed env var to point into that file's sandbox directory (overwriting any `.env` or shell value).
- **`emptyFileSandbox()`** — recursively deletes all sandboxed subdirectories; throws if any setting points outside the sandbox root.
- **`leftoverFiles(root)`** — walks a sandbox root and returns a `SandboxLeftovers[]` listing files (not directories) still present, sorted by sandbox name.
- **`describeLeftovers(leftovers)`** — formats a multi-line error string naming each offending test file and its leftover files.
- **`SandboxLeftovers`** — `{ sandbox: string; files: string[] }` shape used by the two functions above.

## Relationships

- **`tests/support/global-setup.ts`** — creates the sandbox root directory and exports it via `NODE_TEST_FILES_ROOT`; this module reads that variable at call time.
- **`tests/support/global-teardown.ts`** — calls `leftoverFiles` and `describeLeftovers` to detect and report pollution, failing the run when files remain.
- **`tests/support/setup-file-sandbox.ts`** — invokes `applyFileSandbox` before each test file executes so the env vars are in place before the code under test reads them.
- **`tests/integration/product-multipart-write.test.ts`**, **`tests/integration/upload-security.test.ts`** — integration suites that exercise real file I/O; their writes land in the sandbox rather than the repository.
- **`tests/unit/support/file-sandbox.test.ts`** — unit tests covering this module's own functions.

## Notes

- All imports are relative (`node:fs/promises`, `node:path`) because `globalSetup` / `globalTeardown` load this file outside jest's `moduleNameMapper`, so no alias resolution is available.
- `applyFileSandbox` uses plain assignment (`=`), deliberately **not** `??=`, so a value inherited from `.env` or the shell is always overwritten.
- `emptyFileSandbox` guards against deletion outside the sandbox root by checking `startsWith(root + path.sep)` before calling `rm`.
- `leftoverFiles` counts only files; directories created on demand by the app are ignored because teardown removes the whole root regardless.
- The module declares `@module` (no named default export); consumers import the individual functions and constants.
