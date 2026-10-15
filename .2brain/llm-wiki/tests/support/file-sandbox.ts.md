---
source: tests/support/file-sandbox.ts
sha256: eba02dc9dde138978396c83ba5771f010fafe4bff86795b13f484ee8c7945c09
generated_at: 2026-10-15T12:58:14.059810+00:00
model: ollama:qwen3.8:27b
---

# tests/support/file-sandbox.ts

## Purpose

Redirects all application file-writing paths (public assets, quarantine, upload staging, mail spool) into a per-test-file sandbox directory so that integration and contract tests never write into the developer's real application directories. Provides helpers to apply the sandbox, clean it, detect and report leftovers, and check file existence.

## Key elements

- **`FILE_SANDBOX_ROOT_VARIABLE`** – Env var name (`NODE_TEST_FILES_ROOT`) that `global-setup.ts` sets to the jest instance's sandbox root.
- **`SANDBOXED_VARIABLES`** – Mapping of the four app env vars to their subdirectory names (`public`, `quarantine`, `uploads`, `mail-spool`).
- **`sandboxDirectory(root, testPath)`** – Derives a per-test-file directory name by flattening the repo-relative path separators into `__`.
- **`applyFileSandbox(testPath)`** – Calls `overrideEnvironment` to point every sandboxed variable at the test file's subdirectory. Must be called before the code under test reads its config.
- **`emptyFileSandbox()`** – Recursively deletes the test file's four sandbox subdirectories. Throws if any resolved path falls outside the sandbox root (safety guard).
- **`leftoverFiles(root)`** – Scans a sandbox root and returns `SandboxLeftovers[]` for every subdirectory that still contains files (directories are ignored).
- **`fileExists(target)`** – Promise-based existence check (`stat`-based) that resolves `false` instead of rejecting on ENOENT.
- **`describeLeftovers(leftovers)`** – Formats a human-readable error message listing each test file and its leftover files.
- **`SandboxLeftovers`** – Interface: `{ sandbox: string; files: string[] }`.

## Relationships

- **`src/infrastructure/config/store.ts`** – Imports `currentEnvironment` and `overrideEnvironment`; the sandbox is an *override* of the store's env, not a `process.env` write (the store reads `process.env` once at load).
- **`tests/support/paths.ts`** – Imports `REPO_ROOT` used by `sandboxDirectory` to compute the relative path.
- **`tests/support/global-setup.ts`** – Creates the sandbox root and publishes it via `FILE_SANDBOX_ROOT_VARIABLE`.
- **`tests/support/global-teardown.ts`** – Calls `leftoverFiles` and `describeLeftovers` to fail the run if any test left files behind.
- **`tests/support/setup-file-sandbox.ts`** – Per-test-file setup hook that calls `applyFileSandbox` / `emptyFileSandbox`.
- **Integration & contract tests** (`image-acl`, `orphaned-images`, `product-multipart-write`, `upload-claim`, `upload-security`, `role-hierarchy`, `shop`, `demo-routes`, `mailer-attachments`, `api.contract`) – Rely on the sandbox to receive redirected file paths and use `fileExists` for assertions.

## Notes

- **Relative imports only.** `globalSetup` and `globalTeardown` load this file outside Jest's `moduleNameMapper`, so `../../src/...` paths are required rather than alias imports.
- **Override, not assign-if-absent.** `applyFileSandbox` uses `overrideEnvironment` (unconditional set) deliberately: a value inherited from `.env` or the shell names a *real* directory, which a test must never write into.
- **`sandboxDirectory` flattening.** Path separators become `__`, so `tests/integration/shop.test.ts` maps to a directory named `tests__integration__shop.test.ts`. Teardown inverts this with `replaceAll('__', '/')` in the error message.
- **`leftoverFiles` counts files only.** The code under test creates directories on demand; those are not considered test residue.
- **`emptyFileSandbox` safety check.** Before deleting, it verifies every resolved path is a child of the sandbox root; a misconfigured run fails fast rather than risking deletion of a real `public/` or `uploads/` directory.
