---
source: tests/unit/support/file-sandbox.test.ts
sha256: 2d524da6add15f21676d8f3d4e640381f24888422ff5c6fc9134f2c82d4ac61e
generated_at: 2026-11-08T10:44:29.533323+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/file-sandbox.test.ts

## Purpose

Unit tests for the file-sandbox module (`tests/support/file-sandbox.ts`). They verify that the sandbox correctly redirects file-writing paths into a per-test temp directory, safely cleans up files a test wrote, detects and reports leftover files, and refuses to operate when preconditions are missing. Tests use real filesystem operations under a `tmpdir` root rather than mocking `fs`, since the behavior under test *is* what lands on disk.

## Key elements

- **`touch(file)`** — local helper; creates parent directories recursively then writes a single-byte file at the given absolute path.
- **`beforeEach`** — creates a fresh `mkdtemp` root under the OS temp dir and stores it in the `FILE_SANDBOX_ROOT_VARIABLE` env var via `setEnvironment`.
- **`afterEach`** — recursively removes the root, forcing removal of any residue.
- **`describe('sandboxDirectory')`** — asserts the sandbox directory name is the repo-relative test path with separators replaced by `__`.
- **`describe('applyFileSandbox')`** — verifies that `NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, and `NODE_MAIL_SPOOL_PATH` are all repointed inside the per-test sandbox; also covers the two guard clauses (missing root, missing test path).
- **`describe('emptyFileSandbox')`** — confirms all four sub-directories are emptied and `leftoverFiles` returns `[]`; also confirms it throws (and deletes nothing) when a configured path points outside the sandbox root.
- **`describe('leftoverFiles')`** — covers the empty-result case (missing root, empty directories), and the happy path: groups files by their sandbox folder, sorted by sandbox name then file path.
- **`describe('describeLeftovers')`** — checks the human-readable output format: sandbox name (separators restored to `/`) on one line, indented file paths beneath.

## Relationships

- **`tests/support/file-sandbox.ts`** — the module under test. All five exports (`sandboxDirectory`, `applyFileSandbox`, `emptyFileSandbox`, `leftoverFiles`, `describeLeftovers`) plus the `FILE_SANDBOX_ROOT_VARIABLE` constant are imported and exercised here.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in `beforeEach` to register the sandbox root and in individual tests to set/override config keys (e.g., `NODE_PUBLIC_PATH`).
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment()`, read after `applyFileSandbox` to assert that config values were actually rewritten to sandbox paths.

## Notes

- Tests use **real** `fs/promises` calls (`mkdtemp`, `mkdir`, `writeFile`, `rm`) against the OS temp directory; they do not mock `node:fs`. This is intentional — the contract is about disk state.
- The `TEST_PATH` constant is constructed with `path.join(__dirname, …)` to produce a stable, absolute path that looks like a real repo file, so `sandboxDirectory`'s relative-path logic is exercised realistically.
- The "refuses a setting outside the sandbox root" test creates a *second* temp dir and asserts it is left untouched when `emptyFileSandbox` throws, guarding against a partial-deletion bug.
- `leftoverFiles` is tested to ignore empty directories — only actual files count as leftovers, so a test that created a directory tree but wrote no files produces no report.
