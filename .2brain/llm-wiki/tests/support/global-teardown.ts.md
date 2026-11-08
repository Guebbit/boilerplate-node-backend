---
source: tests/support/global-teardown.ts
sha256: ac72334028b2d3f57d9bdd80df04e6352d6dca2c0585a35b13b41afcc15abcd2
generated_at: 2026-11-08T09:55:14.073705+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-teardown.ts

## Purpose

Jest `globalTeardown` hook that runs once per jest instance after the last worker exits. It stops the shared in-memory Mongo started by `global-setup.ts`, removes the instance's temp roots, and—critically—verifies that no test file left files in its sandbox, failing the run if it finds leftovers.

## Key elements

- **`globalTeardown`** (default export) — async function that performs cleanup in three phases:
  1. Stops the in-memory Mongo server (best-effort, errors swallowed).
  2. Recursively removes the instance data root (best-effort).
  3. Checks the instance files root for leftover files, removes the root, and **throws** if any leftovers were found.

## Relationships

- **`tests/support/global-setup.ts`** — counterpart; provides `instanceDataRoot()`, `instanceFilesRoot()`, and the `TestGlobals` type. Teardown is the cleanup side of the setup/teardown pair.
- **`tests/support/file-sandbox.ts`** — provides `leftoverFiles()` (scans the files root for stray files) and `describeLeftovers()` (formats a human-readable error naming the offending test file).

## Notes

- Only the leftover-file check can fail the test run. Stopping Mongo and removing the data root are intentionally best-effort (`.catch(() => {})`).
- Leftover files are **removed first**, then the error is thrown—so the machine is left clean regardless of outcome.
- A killed jest instance is swept by the **next** run, not by this one (per the contract described in `global-setup.ts`).
- The thrown error names the specific test file that failed to clean up its sandbox, not the teardown itself.
