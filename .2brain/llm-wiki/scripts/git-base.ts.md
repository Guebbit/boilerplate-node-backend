---
source: scripts/git-base.ts
sha256: 804f89f5a899c60fddc48c62da21a4829616e1e326cabe580f119288a0b1386f
generated_at: 2026-11-14T17:35:32.134637+00:00
model: ollama:qwen3.8:27b
---

# scripts/git-base.ts

## Purpose

Provides two shared helpers for scripts that shell out to `git`: a sanitized environment (stripping `GIT_*` variables that could silently redirect a nested invocation) and a merge-base resolver that tolerates a missing `origin/main` on fresh clones. Exists so every caller gets the same env-safety and fallback semantics without duplicating the logic.

## Key elements

- **`gitEnvironment()`** (exported) — Returns a copy of `process.env` with every `GIT_*` key removed. Must be passed as `env` to any `execFileSync('git', …)` call whose `cwd`/`-C` target is not `REPO_ROOT`.
- **`resolveRef(ref)`** (internal) — Runs `git merge-base HEAD <ref>` in `REPO_ROOT`; returns the SHA or `undefined` on failure.
- **`mergeBase(base, scriptName, resolve?)`** (exported) — Resolves the merge-base against the given ref. Falls back from `origin/main` → `origin/HEAD` → `undefined` (skip). Any non-`origin/main` ref that fails to resolve exits with code 2. Accepts an injectable `resolve` function for test overrides.

## Relationships

- Imports `REPO_ROOT` from **`scripts/modules-on-disk.ts`**.
- Consumed by audit/doc/mutation/hook scripts: `scripts/audit/check-clean.ts`, `scripts/contracts/check-asyncapi-breaking.ts`, `scripts/docs/check-references.ts`, `scripts/docs/repo-references.ts`, `scripts/hooks/check-generated-fresh.ts`, `scripts/hooks/stale-generated-files.ts`, `scripts/mutation/run-diff.ts`, `scripts/pairing/linked-worktree.ts`, `scripts/testing/scratch-copy.ts`.
- Unit-tested in `tests/unit/scripts/git-base.test.ts`; the fallback and env-filtering behavior is also exercised indirectly through `tests/unit/scripts/audit/check-clean.test.ts`, `tests/unit/scripts/docs/repo-references.test.ts`, `tests/unit/scripts/hooks/stale-generated-files.test.ts`, and `tests/unit/scripts/docs/code-citations.test.ts`.

## Notes

- The header comment states the frontend repo's `scripts/git-base.ts` carries an identical copy of `gitEnvironment()`; keep the two in sync if the filter changes.
- `gitEnvironment()` is critical for git-hook contexts: hooks export `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, etc., which would otherwise override the `cwd`/`-C` a nested `git` call was aimed at, causing it to read the hook's repo and silently exit 0.
- `mergeBase` returns `undefined` (not a thrown error) when *neither* `origin/main` nor `origin/HEAD` resolves, signalling the caller to **skip** the check rather than fail — useful for fresh clones with no usable remote.
- An explicitly passed `--base=<ref>` (anything other than the literal string `origin/main`) that fails to resolve will `process.exit(2)`; the caller's specific request is never silently swapped.
