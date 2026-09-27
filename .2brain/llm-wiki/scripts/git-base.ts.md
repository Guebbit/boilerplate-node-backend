---
source: scripts/git-base.ts
sha256: b0ef16a1dc9b18aecb4a5206312ebe0248079641bc0cca312e55939e02b85435
generated_at: 2026-09-27T13:56:45.734514+00:00
model: ollama:qwen3.8:27b
---

# scripts/git-base.ts

## Purpose

Shared git utilities for repository-level scripts that need to compute a merge-base between `HEAD` and a target ref. It centralises the repo-root path, a safe environment for nested `git` invocations, and a fallback-aware merge-base resolver so that individual scripts (diff, checks, pairing) don't each re-implement the same logic.

## Key elements

- **`REPO_ROOT`** – Constant pointing to the repository root (parent of `scripts/`). Every `git` call in this file uses it as `cwd`, so callers don't need to worry about their own working directory.
- **`gitEnvironment()`** – Returns a copy of `process.env` with `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` removed. Required whenever a nested `git` call targets a checkout *other than* `REPO_ROOT` (e.g. a linked worktree), because those inherited variables silently redirect the command to the outer hook's repo.
- **`resolveRef(ref)`** *(private)* – Runs `git merge-base HEAD <ref>` at `REPO_ROOT`; returns the SHA or `undefined` on failure.
- **`mergeBase(base, scriptName, resolve?)`** – Public resolver. Tries `base` directly; if it is the default `'origin/main'` and that fails, falls back to `'origin/HEAD'`. Returns `undefined` (caller should skip) when neither resolves, or calls `process.exit(2)` when a caller-supplied explicit ref is unresolvable. The `resolve` parameter is injectable for unit tests.

## Relationships

- **`scripts/pairing/linked-worktree.ts`** – Consumes `gitEnvironment()` so its `git` commands targeting a sibling worktree aren't silently redirected by the outer hook's `GIT_DIR` / `GIT_WORK_TREE`.
- **`scripts/contracts/check-asyncapi-breaking.ts`**, **`scripts/docs/check-references.ts`**, **`scripts/mutation/run-diff.ts`** – Call `mergeBase()` to obtain the base SHA against which to diff or compare.
- **`scripts/docs/repo-references.ts`** – Uses `REPO_ROOT` (and/or `mergeBase`) to anchor file-path resolution relative to the repo.
- **`tests/unit/scripts/git-base.test.ts`** – Direct unit tests; injects a stub `resolve` to exercise the fallback and exit paths without a real git binary.
- **`tests/unit/scripts/pairing/linked-worktree.test.ts`**, **`tests/unit/scripts/docs/repo-references.test.ts`** – Transitively exercise `gitEnvironment` / `REPO_ROOT` through the scripts under test.

## Notes

- `gitEnvironment()` is not a convenience wrapper — it is a **correctness requirement**. Omitting it when `cwd` ≠ `REPO_ROOT` causes the nested git call to silently operate on the wrong repository while still exiting 0.
- The `origin/main` → `origin/HEAD` fallback exists only for the *default* base. If a script passes `--base=release/1.0`, an unresolvable ref is a hard error (`exit 2`), never a silent swap.
- A return value of `undefined` from `mergeBase` is a **skip signal**, not a failure: the caller should log and exit 0 (e.g. fresh clone, no remote fetched yet).
- `resolveRef` is intentionally module-private; all public callers go through `mergeBase`, which is the only entry point that knows the fallback policy.
