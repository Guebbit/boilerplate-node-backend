---
source: tests/support/file-sandbox.ts
sha256: bb4ffd98e05880f8c49794eb688a416d24c4546e96a46989d2cdea2402795371
generated_at: 2026-09-27T15:59:52.668914+00:00
model: ollama:qwen3.8:27b
---

# tests/support/file-sandbox.ts

## Purpose

Redirects every file-writing application setting into a per-test-file sandbox directory so tests never write to real application folders on the developer's machine. Provides the cleanup, leftover-detection, and failure-reporting primitives that the jest global teardown uses to fail a run when a test leaves files behind.

## Key elements

- **`FILE_SANDBOX_ROOT_VARIABLE`** – Env-var name (`NODE_TEST_FILES_ROOT`) that `global-setup.ts` uses to publish the sandbox root to workers.
- **`SANDBOXED_VARIABLES`** (private) – Maps five application env vars (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_INVOICE_CACHE_PATH`, `NODE_MAIL_SPOOL_PATH`) to their sandbox subdirectory names.
- **`sandboxDirectory(root, testPath)`** – Computes the per-test-file sandbox path by flattening the repo-relative test path with `__` separators.
- **`applyFileSandbox(testPath)`** – Assigns every sandboxed env var to a path under the test file's sandbox directory. Uses `=`, not `??=`, so it overrides any `.env` or shell value.
- **`emptyFileSandbox()`** – Recursively deletes all sandbox subdirectories. Refuses to delete if any sandboxed setting points outside the sandbox root (prevents accidental `rm` of a real directory).
- **`leftoverFiles(root)`** – Scans the sandbox root for files (ignoring directories) still present after a test file ran; returns `SandboxLeftovers[]` sorted by sandbox name.
- **`fileExists(target)`** – `stat`-based existence check; resolves `false` on any error rather than throwing.
- **`describeLeftovers(leftovers)`** – Formats the multi-line failure message naming each test file and its leftover files.
- **`SandboxLeftovers`** – Interface: `{ sandbox: string; files: string[] }`.

## Relationships

- **`tests/support/paths.ts`** – Supplies `REPO_ROOT`, used by `sandboxDirectory` to compute the relative test path.
- **`tests/support/global-setup.ts`** – Creates the sandbox root directory and sets `FILE_SANDBOX_ROOT_VARIABLE` before workers start.
- **`tests/support/global-teardown.ts`** – Calls `leftoverFiles` and `describeLeftovers` to detect and report uncleaned files, failing the run.
- **`tests/support/setup-file-sandbox.ts`** – Invokes `applyFileSandbox` for each test file before it executes.
- **`tests/unit/support/file-sandbox.test.ts`** – Unit tests exercising the public exports of this module.
- **Test files that write files** (e.g. `invoice.test.ts`, `product-multipart-write.test.ts`, `upload-security.test.ts`, `mailer-attachments.test.ts`, `mailer-dispatch.test.ts`) – Rely on the sandbox redirect so their writes land in the sandbox; use `fileExists` to assert files were created or cleaned up.

## Notes

- **Relative imports only.** `globalSetup` and `globalTeardown` load this module outside jest's `moduleNameMapper`, so no aliased/package imports are permitted.
- **Assignment, not coalescing.** `applyFileSandbox` uses `process.env[variable] = …` deliberately: a value inherited from `.env` or the shell names a real directory and must be overridden.
- **Sandbox name encoding.** Path separators in the test file's relative path become `__`; `describeLeftovers` reverses this with `split('__').join('/')` for human-readable output.
- **`leftoverFiles` ignores directories.** The code under test creates subdirectories on demand; only files (things a test actively caused) count as leftovers.
- **`fileExists` swallows all stat errors.** Any rejection (permission denied, race, etc.) resolves to `false`, not just ENOENT. Callers should be aware a permission issue looks identical to "file not there."
