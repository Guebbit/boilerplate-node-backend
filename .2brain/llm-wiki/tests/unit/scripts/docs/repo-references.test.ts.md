---
source: tests/unit/scripts/docs/repo-references.test.ts
sha256: 279026c0efe951971df866a2d2b26662b59c201f4311d4f0da0aab5b53eca436
generated_at: 2026-11-08T10:36:15.556960+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/repo-references.test.ts

## Purpose

Unit tests for the two public helpers in `scripts/docs/repo-references.ts`: `gitEnvironment` (env-sanitisation for nested `git` calls inside a pre-commit hook) and `trackedTargets`/`resolves` (the tracked-file set against which documentation references are validated). The tests exist to pin down exact boundary behaviour — what gets stripped, what gets left, and which paths are allowed to resolve.

## Key elements

- **`describe('gitEnvironment')`** — three cases:
  - Confirms `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` are removed from the returned env object when set.
  - Confirms unrelated vars (e.g. `PATH`) pass through untouched.
  - Confirms the function is a plain copy (no mutation) when none of the three vars are present.
- **`describe('trackedTargets')`** — two cases, each run against a real scratch git repo created in `os.tmpdir()`:
  - `resolves(trackedTargets(root).targets, 'src/kept.ts')` returns `true` for a file that exists in the index.
  - `resolves(trackedTargets(root).targets, 'src/gone.ts')` returns `false` when only a `.2brain/llm-wiki` mirror of the path is tracked, preventing a stale mirror page from vouching for a deleted source file.
- **`run`** — promisified `execFile`; used for `git init` / `git add` in the `trackedTargets` setup.
- **`HOOK_VARS`** — typed tuple of the three git-hook env vars; used to build the "none set" scenario and documents which keys the harness restores after each case.

## Relationships

- **`scripts/docs/repo-references.ts`** — the module under test. This file imports `gitEnvironment`, `resolves`, and `trackedTargets` and asserts their contract.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, which safely sets/unsets `process.env` keys and restores them after each test case (the "put back after every case by the harness" mentioned in the header comment).

## Notes

- The `trackedTargets` suite uses a **real** `git init` + `git add` (no commit) in a temp directory; `ls-files` reads the index, so a commit is unnecessary. This means the tests depend on `git` being available on `PATH`.
- `gitEnvironment` is intentionally passed as `env` to every `git` subprocess call in the `trackedTargets` setup — this both exercises the helper and ensures the scratch repo isn't accidentally pointed at the developer's real repository.
- `setProcessEnvironment` from the test harness is the only way env vars are mutated; raw `process.env` assignment is avoided so the harness can guarantee cleanup.
