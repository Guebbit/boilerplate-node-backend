---
source: scripts/git-base.ts
sha256: 6844f25adbc4d3edd990b0e6bfddf6527ab7835e49e257477498ebfbc913cb4b
generated_at: 2026-11-08T02:51:26.397906+00:00
model: ollama:qwen3.8:27b
---

# scripts/git-base.ts

## Purpose

Provides shared git helpers for CI and local verification scripts: a sanitized environment for nested `git` calls, and a resilient merge-base resolution strategy that gracefully handles fresh clones or non-standard default-branch names.

## Key elements

- **`gitEnvironment()`** — Returns a copy of `process.env` with `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` deleted. Must be passed as `env` to any `execFileSync('git', …)` call whose `cwd`/`-C` targets a checkout other than `REPO_ROOT`, because those three variables silently redirect a nested git to the hook's own repo.
- **`resolveRef`** *(private)* — Runs `git merge-base HEAD <ref>` in `REPO_ROOT`; returns the SHA or `undefined` on failure.
- **`mergeBase(base, scriptName, resolve?)`** — Resolves the merge-base SHA for a given ref. Falls back from `origin/main` → `origin/HEAD` before giving up. Exits with code 2 if a non-default ref is unresolvable (the caller explicitly asked for it). Returns `undefined` when neither origin ref resolves, signalling the caller to *skip* rather than fail. Accepts an injectable `resolve` function for testability.

## Relationships

- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`, used as the `cwd` for all git invocations.
- **`scripts/contracts/check-asyncapi-breaking.ts`**, **`scripts/docs/check-references.ts`**, **`scripts/docs/repo-references.ts`**, **`scripts/hooks/check-generated-fresh.ts`**, **`scripts/hooks/stale-generated-files.ts`**, **`scripts/mutation/run-diff.ts`**, **`scripts/pairing/linked-worktree.ts`** — Downstream consumers that call `mergeBase` (and/or `gitEnvironment`) to determine the comparison baseline or to execute git against a specific checkout.
- **`tests/unit/scripts/git-base.test.ts`** — Unit tests exercising `mergeBase` with a mocked `resolve` and `gitEnvironment`.
- **`tests/unit/scripts/hooks/stale-generated-files.test.ts`**, **`tests/unit/scripts/pairing/linked-worktree.test.ts`**, **`tests/unit/scripts/docs/repo-references.test.ts`** — Integration-level tests that exercise the consuming scripts, indirectly covering this module's behavior.

## Notes

- `gitEnvironment` is the *only* safe way to run `git` against a non-root checkout from within a git hook; omitting it causes the nested call to silently operate on the hook's repo while still exiting 0.
- `mergeBase` deliberately treats `origin/main` as the *default* ref that may fall back to `origin/HEAD`; any other ref that fails to resolve is a hard error (exit 2). Do not rely on the fallback for custom base refs.
- The `resolve` parameter defaults to the real git implementation but is swappable in tests—pass a stub to avoid spawning processes.
