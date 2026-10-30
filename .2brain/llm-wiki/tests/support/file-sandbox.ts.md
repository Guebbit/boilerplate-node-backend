---
source: tests/support/file-sandbox.ts
sha256: 6aa739745fa755db1eaed907836f8add55894bf53af355e1c4a49a12f3765e5b
generated_at: 2026-10-29T07:08:05.391351+00:00
model: ollama:qwen3.8:27b
---

# tests/support/file-sandbox.ts

## Purpose

Redirects every file-writing application setting into a per-test-file directory under a jest-instance sandbox root, so tests that create files never write onto the developer's real `public/`, `uploads/`, etc. It also provides the teardown logic that detects and reports leftover files, and a shared `stat`-based existence check for test assertions.

## Key elements

- **`FILE_SANDBOX_ROOT_VARIABLE`** (`'NODE_TEST_FILES_ROOT'`) — the environment variable `global-setup.ts` publishes to point workers at this jest instance's sandbox root.
- **`SANDBOXED_VARIABLES`** — readonly mapping of six application env vars (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_MAIL_SPOOL_PATH`, `NODE_DOCUMENT_STORE_PATH`, `NODE_ACCOUNT_EXPORT_STORE_PATH`) to their subdirectory names (`public`, `quarantine`, `uploads`, `mail-spool`, `documents`, `exports`).
- **`SandboxLeftovers`** (interface) — `{ sandbox: string; files: string[] }`, one entry per test file that left files behind.
- **`sandboxDirectory(root, testPath)`** — computes the per-test-file directory by taking the repo-relative test path and joining it under `root`, with path separators replaced by `__`.
- **`applyFileSandbox(testPath)`** — calls `overrideEnvironment` (from the config store) to point every sandboxed variable at `<sandboxDir>/<segment>`. Uses assignment, not `??=`, so a `.env` value is overridden, not preserved.
- **`emptyFileSandbox()`** — deletes (recursive, force) every sandboxed subdirectory. Refuses to delete a path that resolves outside the sandbox root.
- **`leftoverFiles(root)`** — scans `root` for subdirectories, then recursively lists files inside each; returns a sorted `SandboxLeftovers[]` containing only entries with ≥ 1 file.
- **`fileExists(target)`** — wraps `stat` to resolve `true`/`false` instead of rejecting on ENOENT.
- **`describeLeftovers(leftovers)`** — formats the multi-line failure message naming each test file and its leftover files.

## Relationships

- **`src/infrastructure/config/store.ts`** — imports `currentEnvironment` (to read the sandbox root and to validate paths in `emptyFileSandbox`) and `overrideEnvironment` (to apply the sandbox redirection without mutating `process.env` directly).
- **`tests/support/paths.ts`** — imports `REPO_ROOT` for computing the repo-relative test-file path in `sandboxDirectory`.
- **Test consumers** (all listed neighbors under `tests/integration/`, `tests/fuzz/`, and `src/modules/*/tests/`) — call `applyFileSandbox` before the suite runs, `emptyFileSandbox` after, and `fileExists` in individual assertions.

## Notes

- **Relative imports only.** `globalSetup` and `globalTeardown` load this module outside jest's `moduleNameMapper`, so `../../src/...` paths are used rather than any alias.
- **Not a `process.env` write.** The config store snapshots `process.env` once; the sandbox therefore goes through `overrideEnvironment`, which the store consults at read time.
- **Sandbox directory naming.** The test file's repo-relative path has every separator replaced with `__` (e.g. `src/modules/account/tests/contract/api.contract.test.ts` → `src__modules__account__tests__contract__api.contract.test.ts`). `describeLeftovers` reverses this for the error message.
- **Teardown is fail-fast.** If `leftoverFiles` returns a non-empty array, the run fails with the output of `describeLeftovers`, naming the offending test file and every file it left behind.
- **`emptyFileSandbox` is a safety gate, not just cleanup.** It validates that each resolved path starts with `root + path.sep` before calling `rm`, preventing a misconfigured variable from deleting a real application directory.
