---
source: tests/support/global-teardown.ts
sha256: ac72334028b2d3f57d9bdd80df04e6352d6dca2c0585a35b13b41afcc15abcd2
generated_at: 2026-10-15T12:58:37.030943+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-teardown.ts

## Purpose

Jest's per-instance global teardown: stops the shared in-memory Mongo server started by `global-setup.ts` and removes this instance's temp-file roots. Cleanup of the server and temp files is best-effort (never fails an already-finished run), but leftover files in the sandbox are treated as a hard failure to enforce that each test cleans up after itself.

## Key elements

- **`globalTeardown`** (default export) — async function Jest calls once after the last worker exits. In order it:
  1. Stops the Mongo server stored on `globalThis.__testMongoServer` (swallows errors).
  2. Recursively deletes `instanceDataRoot()` (swallows errors).
  3. Collects leftovers from `instanceFilesRoot()`, deletes that root (swallows errors).
  4. Throws an `Error` naming the offending test file(s) if any leftovers were found.

## Relationships

- **`tests/support/global-setup.ts`** — Provides `instanceDataRoot`, `instanceFilesRoot`, and the `TestGlobals` type. `global-setup` starts the Mongo server and creates the per-instance directories that this file is responsible for tearing down. The two files are the start/end of the same per-instance lifecycle.
- **`tests/support/file-sandbox.ts`** — Provides `leftoverFiles` (discovers files that a test left in its sandbox) and `describeLeftovers` (formats the error message). This file delegates all "what should be here" logic to the sandbox module.

## Notes

- **Per-instance ownership is the entire cleanup contract.** A killed or crashed instance does not run this teardown; its roots are swept by the *next* run. Don't add "orphan sweep" logic here.
- **Only one code path can throw.** The `rm` and `.stop()` calls are all wrapped in `.catch(() => {})`. The intentional failure is solely the leftover-file check, so the machine is always left clean regardless of the outcome.
- **Default export is mandatory.** Jest's `globalTeardown` config resolves the module's default export; a named export would be silently ignored.
