---
source: tests/unit/scripts/testing/scratch-copy.test.ts
sha256: 80bec1dfe9542e00de046e15ab37d343fd7ee22fcfe800230682b8a91096a63c
generated_at: 2026-11-15T00:26:49.999062+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/scratch-copy.test.ts

## Purpose

Unit test for the `runIn` helper used by `measure:*` scripts. It verifies that `runIn` strips outer `GIT_*` environment variables (which, under a git hook, point at the real repository) from the child process while leaving unrelated variables intact.

## Key elements

- **`describe('runIn')` / `it('hides the outer GIT_* variables…')`** — Single test that sets `GIT_INDEX_FILE` and `KEEP_ME` in the parent env via `setProcessEnvironment`, then runs a Node one-liner through `runIn` that asserts `GIT_INDEX_FILE` is `undefined` and `KEEP_ME` is `'1'` (exits 0 on success, 1 otherwise). The test expects `runIn` to return `true`.

## Relationships

- **`scripts/testing/scratch-copy.ts`** — The module under test; provides the `runIn(workdir, cmd, args)` function that spawns a child process in a scratch directory.
- **`tests/support/environment.ts`** — Provides `setProcessEnvironment`, used to inject controlled env vars into the test process before invoking `runIn`.

## Notes

- The scratch directory for the test is simply `os.tmpdir()`; no cleanup is performed here (the directory is pre-existing).
- The child command is `process.execPath -e <inline-script>`, so the test exercises the real `runIn` spawn path rather than mocking `child_process`.
- The file-level doc comment explains *why* the stripping matters (git-hook context) — the test itself only proves the mechanical behavior.
