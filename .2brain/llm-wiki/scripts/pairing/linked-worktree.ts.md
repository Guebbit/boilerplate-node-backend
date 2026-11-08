---
source: scripts/pairing/linked-worktree.ts
sha256: ad847546d95ec88fb976951aec2b90ba90609ac8fac8039634e28a2675498051
generated_at: 2026-11-08T02:56:12.694563+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/linked-worktree.ts

## Purpose

Detects whether a given directory is a **linked `git worktree** (as opposed to the repository's main working tree) and exposes a guard predicate for the "worktree → main" write direction that `sync:frontend` must refuse. It exists so pairing/sync scripts can distinguish between two checkouts that share a repository but differ in which one is the canonical main.

## Key elements

- **`isLinkedWorktree(directory: string): boolean | undefined`** — Runs `git rev-parse --path-format=absolute --git-dir --git-common-dir` via `execFileSync`. If the two reported paths differ, the checkout is a linked worktree. Returns `undefined` when the directory is not inside a git checkout at all.
- **`writesIntoMainFromWorktree(source: string, target: string): boolean`** — Convenience predicate: `true` only when `source` is a linked worktree **and** `target` is the main working tree. Used as the guard condition that blocks a contract write in the unsafe direction.

## Relationships

- **`scripts/git-base.ts`** — Supplies `gitEnvironment()`, which is passed as the `env` option to `execFileSync`. This strips inherited `GIT_DIR` / `GIT_WORK_TREE` variables (set by git hooks) so that `-C directory` is honoured rather than overridden by the hook's own checkout.
- **`scripts/pairing/sync-to-frontend.ts`** — Consumes `writesIntoMainFromWorktree` to refuse a sync when the source is a linked worktree and the target is the main frontend checkout.
- **`tests/unit/scripts/pairing/linked-worktree.test.ts`** — Unit-tests both exports (worktree vs. main, non-repo directory, the direction predicate).

## Notes

- The `env: gitEnvironment()` argument is load-bearing. Without it, running inside a `pre-commit` or similar hook makes `execFileSync` inherit `GIT_DIR`/`GIT_WORK_TREE`, which causes `git -C directory` to resolve against the *hook's* checkout instead of the directory you actually want to inspect.
- `stdio` is set to `['ignore', 'pipe', 'ignore']` so the stderr message "not a git repository" (expected outside a repo) is silenced; the `catch` block then returns `undefined` rather than throwing.
- `output.trim().split('\n', 2)` relies on the two rev-parse flags emitting exactly one line each in a known order; there is no delimiter handling beyond that.
