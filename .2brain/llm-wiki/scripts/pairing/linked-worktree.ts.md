---
source: scripts/pairing/linked-worktree.ts
sha256: 7123ec2d2210f70c9bd260d632487221e6681b834a2549452ddcf2788983479c
generated_at: 2026-09-27T13:59:12.897901+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/linked-worktree.ts

## Purpose

Detects whether a directory is a linked `git worktree` (as opposed to the repository's main working tree) and provides a guard that flags writes flowing from a linked worktree into a main checkout. This exists so the pairing/sync tooling can enforce the rule that the frontend main checkout only accepts a contract from the backend main checkout.

## Key elements

- **`isLinkedWorktree(directory: string): boolean | undefined`** — Runs `git rev-parse --path-format=absolute --git-dir --git-common-dir` inside the given directory. If the two paths differ, the checkout is a linked worktree (`true`); if they are identical, it is the main working tree (`false`). Returns `undefined` when the directory is not inside any git repository.
- **`writesIntoMainFromWorktree(source: string, target: string): boolean`** — Composite guard: `true` only when `source` is a linked worktree and `target` is a main checkout. Used to *refuse* exactly that write direction.

## Relationships

- **`scripts/git-base.ts`** — Imports `gitEnvironment()`, which clears inherited `GIT_DIR` / `GIT_WORK_TREE` env vars before invoking `git`. This is essential when the calling process itself runs inside a git hook, where those variables would otherwise redirect the `git -C` call to the hook's checkout.
- **`scripts/pairing/sync-to-frontend.ts`** — Consumes `writesIntoMainFromWorktree` as a pre-write guard; when it returns `true`, the sync is rejected.
- **`tests/unit/scripts/pairing/linked-worktree.test.ts`** — Unit tests covering the linked-worktree vs main-tree detection and the guard's truth table.

## Notes

- The `execFileSync` call deliberately pipes only stdout (`stdio: ['ignore', 'pipe', 'ignore']`); the "not a git repository" message on stderr is the expected non-error path and is discarded rather than surfaced.
- Because `git rev-parse` exits non-zero outside a repository, the function treats *any* thrown error as "not a git checkout" and returns `undefined` rather than propagating. Callers must handle all three return values (`true`, `false`, `undefined`); `writesIntoMainFromWorktree` collapses `undefined` to `false` via strict equality.
- `--path-format=absolute` is required so that the two paths can be compared as plain strings; without it git may emit relative paths that are not directly comparable.
