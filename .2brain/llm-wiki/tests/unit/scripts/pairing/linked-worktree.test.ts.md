---
source: tests/unit/scripts/pairing/linked-worktree.test.ts
sha256: 603068df2ca824ec4998562b3db596781fe4e1bd6fa944264de3c2186f3292d0
generated_at: 2026-09-27T16:13:55.499360+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/linked-worktree.test.ts

## Purpose

Unit and integration tests for `isLinkedWorktree`, `writesIntoMainFromWorktree`, and the `sync:frontend` CLI guard that refuses to write into a frontend's main checkout when invoked from a linked worktree. All tests run against real throwaway git repositories rather than stubs, so the behavior under test is git's own worktree detection, not a mock of it.

## Key elements

- **`git`** – helper that runs a git subcommand in a given directory with a one-off identity and `gitEnvironment()` to neutralise leaked `GIT_DIR`/`GIT_WORK_TREE` vars.
- **`makeRepository(name)`** – creates a fresh repo (one empty commit) plus a linked worktree on branch `lane`; returns `{ main, linked }` paths.
- **`runSync(cwd, frontend, …flags)`** – spawns the real `sync-to-frontend.ts` CLI via `tsx`, sets `FRONTEND_PATH`, suppresses `npx` downloads, and returns `{ status, stderr }` instead of throwing.
- **`describe('isLinkedWorktree')`** – asserts `false` for a main tree, `true` for a linked worktree, `false` from a nested subdirectory, and `undefined` outside any checkout.
- **`describe('writesIntoMainFromWorktree')`** – asserts the predicate is `true` only when the backend is a linked worktree *and* the frontend is a main checkout; `false` in all other combinations.
- **`describe('sync:frontend from a linked worktree')`** – end-to-end CLI tests: default run is refused at the guard; `--dry` passes the guard and hits the (expected) staleness-gate refusal instead.

## Relationships

- **`scripts/git-base.ts`** – provides `gitEnvironment()`, a clean env object that strips `GIT_DIR`/`GIT_WORK_TREE` so git commands and the CLI under test operate on the intended `cwd` rather than whatever checkout a pre-commit hook inherited.
- **`scripts/pairing/linked-worktree.ts`** – the module under test; supplies `isLinkedWorktree` and `writesIntoMainFromWorktree`, which the tests import directly and also exercise indirectly through the CLI.

## Notes

- The test suite intentionally avoids stubbing git: a stub would validate the stub, not the real `git worktree list` / `git rev-parse` calls the production code makes.
- `npm_config_yes=false` and `npm_config_offline=true` are set in `runSync` so the CLI's internal `npx tsx` call fails fast in the bare sandbox instead of triggering a download.
- CLI-spawn tests use a 60-second Jest timeout because `tsx` cold-start exceeds the default 5 s on loaded CI runners.
- `TSX` and `SYNC` are resolved to absolute paths because the test `cwd` (the throwaway sandbox) has no `node_modules` for Node's module resolution to find them.
