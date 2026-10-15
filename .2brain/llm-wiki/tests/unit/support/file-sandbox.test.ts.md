---
source: tests/unit/support/file-sandbox.test.ts
sha256: 2d524da6add15f21676d8f3d4e640381f24888422ff5c6fc9134f2c82d4ac61e
generated_at: 2026-10-15T13:33:24.224956+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/file-sandbox.test.ts

## Purpose

Unit tests for the file-sandbox support module (`tests/support/file-sandbox.ts`). Verifies that test-file writes are redirected into per-test sandbox directories under a temp root, that the sandbox can be safely emptied, and that any leftover files are detected and reported with human-readable paths. Uses the **real filesystem** (no mocked `fs`) because the contract under test is what actually lands on disk.

## Key elements

- **`touch(file)`** (local helper) — creates parent directories and writes a one-byte file; used to seed fixtures on disk.
- **`beforeEach` / `afterEach`** — allocate a fresh `mkdtemp` root, inject it as `FILE_SANDBOX_ROOT_VARIABLE` via `setEnvironment`, and remove the root after each test.
- **`describe('sandboxDirectory')`** — asserts the directory name is the repo-relative test path with separators flattened to `__`.
- **`describe('applyFileSandbox')`** — asserts all four file-writing env vars (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_MAIL_SPOOL_PATH`) are rewritten into the sandbox directory; also asserts it throws when the sandbox root or test path is missing.
- **`describe('emptyFileSandbox')`** — asserts all written files (across all four sub-directories) are deleted; also asserts it refuses to delete a file whose configured path is outside the sandbox root.
- **`describe('leftoverFiles')`** — asserts it returns `[]` for a missing root, ignores empty directories, and groups nested files by their sandbox directory in sorted order.
- **`describe('describeLeftovers')`** — asserts the human-readable message maps sandbox names back to repo-relative `/`-separated paths and lists files indented beneath.

## Relationships

- **`tests/support/file-sandbox.ts`** — the module under test. The file imports `sandboxDirectory`, `applyFileSandbox`, `emptyFileSandbox`, `leftoverFiles`, `describeLeftovers`, and `FILE_SANDBOX_ROOT_VARIABLE` from here.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to set/clear the sandbox-root variable and to override individual config paths before calling the functions under test.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment`, used after `applyFileSandbox` to read back the rewritten path values from the live config store.

## Notes

- `TEST_PATH` is constructed as `path.join(__dirname, '..', '..', 'integration', 'uploads.test.ts')` — it mimics a jest-reported absolute path within the repo, so the sandbox-name derivation (`tests__integration__uploads.test.ts`) is exercised with a realistic depth.
- The safety tests in `applyFileSandbox` and `emptyFileSandbox` deliberately assert **throwing** over silent fallback; the design intent is fail-fast rather than "best effort" deletion.
- `leftoverFiles` returns relative paths (from the sandbox directory), not absolute paths — assertions use `path.join` on relative segments.
- `describeLeftovers` converts the `__` separator back to `/` for display, so the message is what a developer would recognize as a repo path.
