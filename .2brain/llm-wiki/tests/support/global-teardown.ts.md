---
source: tests/support/global-teardown.ts
sha256: b31946b1b2e341f5bbdcfd73a63e228c268cae5f73defec2ec198b179667a090
generated_at: 2026-09-23T20:11:24.124546+00:00
model: ollama:qwen3.8:27b
---

# tests/support/global-teardown.ts

## Purpose

Jest's `globalTeardown` hook: runs once per Jest instance after the last worker exits. It stops the shared in-memory Mongo server started by `global-setup.ts`, deletes the instance-scoped temp directories, and verifies the test sandbox is empty. Exists so that each Jest instance owns and fully cleans up its own runtime artifacts.

## Key elements

- **`globalTeardown` (default export)** — async function, the sole logic of the file.
  1. Stops `globalThis.__testMongoServer` (best-effort; errors are swallowed).
  2. Recursively removes the instance data root (best-effort).
  3. Scans the instance files root for leftover files via `leftoverFiles`, then removes that root (best-effort).
  4. **Throws** if any files were found in the sandbox, naming the offending test file via `describeLeftovers`.

## Relationships

- **`tests/support/global-setup.ts`** — Counterpart. This file imports `instanceDataRoot`, `instanceFilesRoot`, and the `TestGlobals` type from it, and stops the Mongo server that `global-setup` started. Per-instance ownership is the cleanup contract between the two.
- **`tests/support/file-sandbox.ts`** — Provides `leftoverFiles` (scans the sandbox directory) and `describeLeftovers` (formats a human-readable error naming the test file). This file calls both to enforce the "no leftover files" invariant.

## Notes

- Cleanup of the Mongo server and temp dirs is **best-effort** (`.catch(() => {})`); it will never fail a run that has already finished.
- The **only** path that throws is a non-empty sandbox. The directory is still deleted first, so the machine stays clean regardless — the throw is purely to surface *which* test forgot to clean up.
- A killed Jest instance is **not** swept by this teardown; it is cleaned by the *next* run (see the note in `global-setup.ts`).
