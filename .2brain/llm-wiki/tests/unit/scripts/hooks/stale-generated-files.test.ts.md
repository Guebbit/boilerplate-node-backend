---
source: tests/unit/scripts/hooks/stale-generated-files.test.ts
sha256: 8f43167ecbf6f93782567f010ebcf588a44e99991efbf61464cf83d11d91ba3a
generated_at: 2026-11-08T10:37:43.453773+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/hooks/stale-generated-files.test.ts

## Purpose

Unit tests for the `staleGeneratedFiles` pre-commit hook check. Each case creates a real, throwaway git repository in a temp directory and runs the check against it so that the underlying `git checkout-index` call is exercised for real rather than mocked.

## Key elements

- **`FRESH`** – constant string (`'fresh\n'`) representing the canonical output a regeneration would produce; used to distinguish "current" from "stale" content.
- **`repo`** (module-level `let`) – path to the current test's temp directory; reset in `beforeEach`, deleted in `afterEach`.
- **`git(...args)`** – thin wrapper around `execFileSync('git', …)` that pins `cwd` to `repo` and uses `gitEnvironment()` to avoid hook-inherited env vars.
- **`regenerate(tree)`** – stand-in generator: writes `gen.txt` (a tracked file) and `ignored.txt` (a gitignored file) with known content.
- **`stageGenerated(content)`** – writes a `.gitignore` covering `ignored.txt`, writes `gen.txt` with the supplied content, and stages both via `git add`.
- **`check()`** – calls `staleGeneratedFiles({ repo, regenerate, indexEnvironment })` and returns the list of stale paths.
- **`describe('staleGeneratedFiles')`** – seven `it` cases covering: stale detection, pass-on-current, staged-vs-working-tree distinction, missing-from-index detection, `.gitignore` exclusion, read-only contract (no `git diff` after the call), and error propagation from a failing `regenerate`.

## Relationships

- **`scripts/hooks/stale-generated-files.ts`** – the module under test; `staleGeneratedFiles` is the sole function exercised. The test supplies it with a `repo` path, a `regenerate` callback, and an `indexEnvironment` option.
- **`scripts/git-base.ts`** – provides `gitEnvironment()`, a sanitized environment object that strips hook-specific variables (e.g. `GIT_DIR`, `GIT_INDEX_FILE`) so the test's own `git` invocations and the check's internal `git checkout-index` run in a clean context.

## Notes

- Tests rely on **real git binaries** and a real filesystem; they will fail if `git` is absent from `PATH` or if the temp directory is not writable.
- The `gitEnvironment()` call is critical: without it, a CI or editor hook that sets `GIT_DIR`/`GIT_INDEX_FILE` would cause `git init` or `git add` inside the test to operate on the wrong repository.
- The "does not touch the repository" case encodes a **read-only contract**: `staleGeneratedFiles` must not write to the working tree or index, verified by an empty `git diff --name-only` after the call.
- The `regenerate` stand-in intentionally writes a gitignored file (`ignored.txt`) alongside the tracked one to confirm the check excludes ignored paths from its result.
