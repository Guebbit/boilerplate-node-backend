---
source: scripts/git-base.ts
sha256: 6844f25adbc4d3edd990b0e6bfddf6527ab7835e49e257477498ebfbc913cb4b
generated_at: 2026-10-15T09:42:02.981846+00:00
model: ollama:qwen3.8:27b
---

# scripts/git-base.ts

## Purpose

Utility module that provides two git helpers for other scripts in this repo: a safe environment object for spawning nested `git` commands from within hook contexts, and a merge-base resolver with fallback logic for comparing against `origin/main`. It exists so every script that shells out to `git` targeting a different checkout shares one correct, hook-safe pattern instead of re-implementing it.

## Key elements

- **`gitEnvironment(): NodeJS.ProcessEnv`** — Returns a copy of `process.env` with `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` deleted. Must be passed as `env` to any `execFileSync('git', …)` call whose `cwd` or `-C` points at a checkout other than `REPO_ROOT`, because those three vars (injected by git into every hook environment) would silently redirect the nested call to the hook's own repo.
- **`resolveRef(ref): string | undefined`** *(private)* — Runs `git merge-base HEAD <ref>` with `cwd: REPO_ROOT`; returns the trimmed SHA or `undefined` on failure.
- **`mergeBase(base, scriptName, resolve?): string | undefined`** — Public resolver with fallback:
  1. Tries `resolve(base)` directly.
  2. If `base` is the default `'origin/main'` and that fails, retries with `'origin/HEAD'` (follows the remote's actual default branch name).
  3. If `base` is **not** `'origin/main'` and fails, prints an error and calls `process.exit(2)` — an explicit caller request is never silently swapped.
  4. If both origin refs fail for `'origin/main'`, logs a skip message and returns `undefined` so the caller can gracefully skip (e.g., a fresh clone with no usable remote).
  - The `resolve` parameter is injectable (defaults to the real `resolveRef`) so tests can stub git.

## Relationships

- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, the hard-coded checkout path used as `cwd` in `resolveRef`.
- **`tests/unit/scripts/git-base.test.ts`** — Unit tests; injects a fake `resolve` to exercise the fallback and exit paths without invoking real git.
- **Consumer scripts** (`scripts/contracts/check-asyncapi-breaking.ts`, `scripts/docs/check-references.ts`, `scripts/docs/repo-references.ts`, `scripts/mutation/run-diff.ts`, `scripts/pairing/linked-worktree.ts`) — Import `gitEnvironment` and/or `mergeBase` to run their own `git` subprocesses safely and to compute the comparison base.

## Notes

- **Hook-env trap is silent.** If you forget `gitEnvironment()` and a script happens to run inside a git hook, the nested call still exits 0 but operates on the *hook's* repo. There is no error to notice.
- **`mergeBase` return contract is asymmetric.** `undefined` means "skip this check" (safe for CI on fresh clones); `process.exit(2)` means "you asked for a specific ref and it doesn't exist" (hard failure). Callers must branch on `undefined` vs. thrown.
- **`resolveRef` is not exported.** Tests should inject via the `resolve` parameter of `mergeBase` rather than trying to import the private helper.
- **`REPO_ROOT` is absolute and fixed.** `resolveRef` always runs `git` in that one checkout; if a script needs a different worktree it must call git itself with `gitEnvironment()` and its own `cwd`.
