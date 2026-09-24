---
source: tests/unit/support/file-sandbox.test.ts
sha256: 6db09bc48d38c491ef5ef6e568aee8951a52250a4c088a80d8b8bc45657c2d8e
generated_at: 2026-09-23T20:32:24.108264+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/file-sandbox.test.ts

## Purpose

Unit tests for the file-sandbox support module. Verifies that `applyFileSandbox` redirects file-writing environment variables into a per-test-directory under a temp root, that `emptyFileSandbox` removes only files inside that sandbox, and that `leftoverFiles` / `describeLeftovers` correctly detect and report files left on disk. Uses real temp directories rather than a mocked `fs`, because the contract is about what ends up on the filesystem.

## Key elements

- **`OWNED_VARIABLES`** – tuple of the six env vars the sandbox manages (`FILE_SANDBOX_ROOT_VARIABLE`, `NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_INVOICE_CACHE_PATH`, `NODE_MAIL_SPOOL_PATH`). Snapshot-restored in `afterEach`.
- **`TEST_PATH`** – a repo-relative path to a fake integration test, used as the input that `applyFileSandbox` / `sandboxDirectory` consume.
- **`touch(file)`** – helper that `mkdir`s the parent chain and writes a one-byte file.
- **`beforeEach` / `afterEach`** – create a fresh `mkdtemp` root per test, point `FILE_SANDBOX_ROOT_VARIABLE` at it, then `rm -rf` and restore all owned env vars.
- **`describe('sandboxDirectory')`** – asserts the directory name is the repo-relative test path with `/` replaced by `__`.
- **`describe('applyFileSandbox')`** – asserts all five sub-path env vars land under the sandbox directory; asserts it throws when the root variable is unset or the test path is `undefined`.
- **`describe('emptyFileSandbox')`** – writes files into all five sub-directories, calls the function, and verifies they are gone; also verifies it _refuses_ to delete a file whose env-var path escapes the sandbox root.
- **`describe('leftoverFiles')`** – returns `[]` for a missing root, ignores empty directories, and groups files by sandbox with name-sorted order.
- **`describe('describeLeftovers')`** – checks the human-readable output rewrites `__` back to `/` and indents files under their test-file line.

## Relationships

- **`tests/support/file-sandbox.ts`** (imported as `@tests/file-sandbox`) – the module under test. This file imports and exercises its five exports: `FILE_SANDBOX_ROOT_VARIABLE`, `applyFileSandbox`, `describeLeftovers`, `emptyFileSandbox`, `leftoverFiles`, `sandboxDirectory`.

## Notes

- The test deliberately uses **real filesystem operations** (`mkdtemp`, `writeFile`, `rm`, `existsSync`) instead of mocking `fs`; the file's own docblock calls this out.
- `emptyFileSandbox` has a safety guard: if any owned env var points outside the sandbox root, it throws and deletes **nothing**. The test creates a separate `mkdtemp` directory to prove a "precious" file survives.
- `leftoverFiles` treats **directories as non-leftovers**; only actual files trigger a report. The test creates a nested empty directory tree to confirm this.
- `describeLeftovers` converts the `__` separator convention back to `/` for display (e.g. `tests__integration__uploads.test.ts` → `tests/integration/uploads.test.ts`).
