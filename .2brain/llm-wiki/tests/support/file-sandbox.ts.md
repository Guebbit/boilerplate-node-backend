---
source: tests/support/file-sandbox.ts
sha256: 6aa739745fa755db1eaed907836f8add55894bf53af355e1c4a49a12f3765e5b
generated_at: 2026-11-08T09:54:51.088618+00:00
model: ollama:qwen3.8:27b
---

# tests/support/file-sandbox.ts

## Purpose

Redirects every file-writing path used by the application under test into a per-test-file sandbox directory, so tests never create or delete files in real application directories on the developer's machine. It also provides teardown-time detection and reporting of any files a test failed to clean up.

## Key elements

- **`FILE_SANDBOX_ROOT_VARIABLE`** – the env-var name (`NODE_TEST_FILES_ROOT`) that `global-setup.ts` uses to hand the jest instance's sandbox root to workers.
- **`SANDBOXED_VARIABLES`** – the six config variables (`NODE_PUBLIC_PATH`, `NODE_QUARANTINE_PATH`, `NODE_UPLOAD_STAGING_PATH`, `NODE_MAIL_SPOOL_PATH`, `NODE_DOCUMENT_STORE_PATH`, `NODE_ACCOUNT_EXPORT_STORE_PATH`) that get redirected into subdirectories under the per-file sandbox.
- **`sandboxDirectory(root, testPath)`** – computes the sandbox path for a test file by flattening its repo-relative path with `__` separators.
- **`applyFileSandbox(testPath)`** – the main entry point a test calls at load time; uses `overrideEnvironment` to point every sandboxed variable at this file's subdirectory.
- **`emptyFileSandbox()`** – deletes the six sandbox subdirectories; throws if any setting resolves outside the sandbox root.
- **`leftoverFiles(root)`** – scans a sandbox root and returns a `SandboxLeftovers[]` for every directory that still contains files.
- **`fileExists(target)`** – stat-based boolean check; resolves `false` on ENOENT instead of rejecting.
- **`describeLeftovers(leftovers)`** – formats a multi-line failure message naming each test file and its leftover files.
- **`SandboxLeftovers`** – interface with `sandbox` (directory name) and `files` (relative paths).

## Relationships

- **`src/infrastructure/config/store.ts`** – imports `currentEnvironment` (to read the published sandbox root and to validate paths during `emptyFileSandbox`) and `overrideEnvironment` (to redirect the six file-path settings without mutating `process.env`).
- **Contract and integration test files** (account, example, invoicing, fuzz, image-acl, upload, product, shop, demo-routes, orphaned-images, upload-security, upload-claim, download) – each calls `applyFileSandbox` before writing and `emptyFileSandbox` in teardown; several also use `fileExists` to assert a file was or was not written.

## Notes

- Uses **relative imports only** (`../../src/…`, `./paths`) because `globalSetup`/`globalTeardown` load this module outside Jest's `moduleNameMapper`.
- The redirect uses `overrideEnvironment`, **not** a `process.env` write — the config store reads `process.env` once at startup, so env mutation after that point would be invisible.
- `applyFileSandbox` assigns unconditionally (no `??=`) to guarantee that stale `.env` or shell values cannot leak a real directory into a test.
- `leftoverFiles` counts **files only**, not directories; the code under test creates directories on demand and teardown removes the whole root regardless.
- `emptyFileSandbox` deliberately throws (rather than silently skipping) when a sandboxed path resolves outside the root, so a misconfigured run fails loudly instead of deleting a real `public/`.
