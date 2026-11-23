---
source: scripts/pairing/linked-worktree.ts
source_sha256: 1a979ffe101e713030e3fbead076d1b3453792f5dc132c568d1c00f2714568af
context_sha256: d70910caa1139475dfa6cf70e1f57e4a77f627071da731c110d6169e8822c83e
generated_at: 2026-11-22T02:12:18.550143+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/pairing/linked-worktree.ts

## Purpose
Detects whether a checkout is a linked `git worktree` (as opposed to a repository's main working tree), and uses that to decide whether a write from one checkout into another should be refused. It exists so `sync:frontend` can enforce that frontend main only takes a contract from backend main.

## Key elements
- `isLinkedWorktree(directory)` — runs `git -C <directory> rev-parse --path-format=absolute --git-dir --git-common-dir` and compares the two paths. Returns `true` if they differ (linked worktree), `false` if they match (main working tree), and `undefined` if git fails, i.e. the directory is not inside a git checkout.
- `writesIntoMainFromWorktree(source, target)` — returns `true` only when `source` is a linked worktree and `target` is a main checkout. A side that is not a git checkout yields `false`.

## Relationships
- `scripts/git-base.ts` — supplies `gitEnvironment()`, passed as `env` to the `git` call.
- `scripts/pairing/sync-to-frontend.ts` — the `sync:frontend` consumer described in the doc comments. It refuses the worktree → main write that `writesIntoMainFromWorktree` detects.
- `tests/unit/scripts/pairing/linked-worktree.test.ts` — unit tests for this module.

## Notes
- `gitEnvironment()` matters when the caller runs inside a git hook. Git exports `GIT_DIR`/`GIT_WORK_TREE` there, which override `-C` and would point the call at the hook's checkout instead of `directory`.
- Stderr is discarded, and any `git` failure is mapped to `undefined`. A non-repository is the expected answer in that case, not an error.
- `--path-format=absolute` is what makes the two paths comparable as plain strings.
- Tri-state result: callers must distinguish `undefined` from `false`. `writesIntoMainFromWorktree` does this with strict `=== true` / `=== false` checks.
