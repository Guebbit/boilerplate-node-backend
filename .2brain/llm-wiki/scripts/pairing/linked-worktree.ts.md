---
source: scripts/pairing/linked-worktree.ts
sha256: ad847546d95ec88fb976951aec2b90ba90609ac8fac8039634e28a2675498051
generated_at: 2026-10-01T12:37:23.988231+00:00
model: ollama:qwen3.8:27b
---

# scripts/pairing/linked-worktree.ts

## Purpose

Detects whether a given directory is a linked `git worktree` as opposed to the repository's main working tree, and exposes a guard that prevents a linked worktree from writing into a main checkout. This exists so the pairing/sync pipeline can distinguish legitimate main-to-main contract transfers from accidental worktree-to-main writes.

## Key elements

- **`isLinkedWorktree(directory): boolean | undefined`** — Runs `git -C <dir> rev-parse --path-format=absolute --git-dir --git-common-dir` and compares the two absolute paths. Returns `true` for a linked worktree, `false` for the main working tree, `undefined` when the directory is not inside any git repository.
- **`writesIntoMainFromWorktree(source, target): boolean`** — Convenience guard: `true` only when `source` is a linked worktree **and** `target` is the main checkout (i.e. `isLinkedWorktree(source) === true && isLinkedWorktree(target) === false`).

## Relationships

- **`scripts/git-base.ts`** — Imports `gitEnvironment()`, which sanitises the process environment (strips `GIT_DIR`/`GIT_WORK_TREE`) so the `git rev-parse` call resolves against the intended `directory` rather than whatever checkout the caller's own git hook is running in.
- **`scripts/pairing/sync-to-frontend.ts`** — Consumes `writesIntoMainFromWorktree` to refuse syncing a frontend main checkout from a backend linked worktree (contract only flows main → main).
- **`tests/unit/scripts/pairing/linked-worktree.test.ts`** — Unit tests covering the three-state return of `isLinkedWorktree` and the guard logic of `writesIntoMainFromWorktree`.

## Notes

- The return type of `isLinkedWorktree` is intentionally **three-valued** (`true | false | undefined`). Callers that do a plain `=== false` check (as `writesIntoMainFromWorktree` does) will treat a non-git directory as "not a worktree" and allow the write through. If a caller needs to *reject* non-repo directories, it must explicitly test for `undefined`.
- The `env: gitEnvironment()` argument to `execFileSync` is load-bearing, not defensive: inside a git hook, `GIT_DIR` and `GIT_WORK_TREE` are set in the process environment and **override** the `-C` flag, silently redirecting the query to the hook's own checkout.
- Path comparison is a plain string equality on absolute paths; no filesystem resolution or symlink handling is performed.
