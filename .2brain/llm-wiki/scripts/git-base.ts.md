---
source: scripts/git-base.ts
source_sha256: 804f89f5a899c60fddc48c62da21a4829616e1e326cabe580f119288a0b1386f
context_sha256: ae62c39065815b0d754e0d397ad8bd9509a5f0585bfe5ac056cb1465088fec70
generated_at: 2026-11-22T02:06:45.958032+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/git-base.ts

## Purpose
Shared git helpers for repo scripts. It provides a sanitized environment for nested `git` calls and a `mergeBase` resolver. The resolver finds the commit that diff-based checks should compare against, so they only look at what would actually ship.

## Key elements
- **`gitEnvironment()`**: returns `process.env` with every `GIT_*` variable removed. Pass it as `env` to any `execFileSync('git', …)` whose `cwd` or `-C` is not `REPO_ROOT`. It strips:
  - git's local env vars (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, …), which a hook exports and which override `cwd`/`-C`;
  - `GIT_AUTHOR_*` and `GIT_COMMITTER_*`, which change the identity of anything the call writes;
  - `GIT_CONFIG_*` injected settings.
- **`resolveRef(ref)`** (private): runs `git merge-base HEAD <ref>` in `REPO_ROOT`. Returns the trimmed SHA, or `undefined` if git fails.
- **`mergeBase(base, scriptName, resolve = resolveRef)`**: resolves the merge-base of HEAD and `base`.
  - If `base` resolves, it returns the SHA.
  - If `base` is an explicit ref other than `'origin/main'` and fails, it logs an error and calls `process.exit(2)`.
  - If the default `origin/main` fails, it falls back to `origin/HEAD`.
  - If neither resolves, it logs a "skipping" message and returns `undefined`. The caller should then skip the check.
  - The `resolve` parameter exists so tests can inject a fake resolver.

## Relationships
- Imports `REPO_ROOT` from `scripts/modules-on-disk.ts`.
- The neighbor scripts that depend on it include `scripts/audit/check-clean.ts`, `scripts/contracts/check-asyncapi-breaking.ts`, `scripts/docs/check-references.ts`, `scripts/docs/repo-references.ts`, `scripts/hooks/check-generated-fresh.ts`, `scripts/hooks/stale-generated-files.ts`, `scripts/mutation/run-diff.ts`, `scripts/pairing/linked-worktree.ts` and `scripts/testing/scratch-copy.ts`. They are the likely users of `mergeBase` and `gitEnvironment`.
- Tests: `tests/unit/scripts/git-base.test.ts` covers it directly (its comments say the test names the documented minimum set of stripped variables). Other tests under `tests/unit/scripts/` (audit, docs, hooks) cover the scripts that use it.

## Notes
- Skipping on an unresolvable base (return `undefined`) is deliberate, so a clone without a usable `origin` doesn't fail. Callers must handle `undefined`.
- An explicit `--base=<ref>` is never silently replaced by a fallback; it fails hard with exit code 2.
- A nested git call that keeps the outer `GIT_*` variables can silently read the hook's own repo and still exit 0, which is why `gitEnvironment()` exists.
- The file's comment says the FE repo's `scripts/git-base.ts` carries an identical copy of `gitEnvironment`. Keep the two in sync.
