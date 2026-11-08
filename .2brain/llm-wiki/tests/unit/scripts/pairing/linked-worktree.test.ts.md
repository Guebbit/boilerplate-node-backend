---
source: tests/unit/scripts/pairing/linked-worktree.test.ts
sha256: 603068df2ca824ec4998562b3db596781fe4e1bd6fa944264de3c2186f3292d0
generated_at: 2026-11-08T10:39:33.814847+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/linked-worktree.test.ts

## Purpose

Unit and integration tests for the linked-worktree guard (`isLinkedWorktree`, `writesIntoMainFromWorktree`) and the `sync:frontend` CLI's refusal wiring. All cases run against real throwaway git repositories in a temp sandbox so that worktree detection is exercised through actual git metadata rather than stubs.

## Key elements

- **`git(directory, ...argv)`** — helper that runs `git` via `execFileSync` with a one-off identity and `gitEnvironment()` to prevent `GIT_DIR`/`GIT_WORK_TREE` leakage from a pre-commit hook context.
- **`makeRepository(name)`** — creates a bare repo with one empty commit and a linked worktree on branch `lane`; returns `{ main, linked }` paths.
- **`runSync(cwd, frontend, ...flags)`** — spawns `tsx scripts/pairing/sync-to-frontend.ts` as a child process, capturing exit code and stderr. Sets `FRONTEND_PATH`, `gitEnvironment()`, and `npm_config_yes=false` / `npm_config_offline=true` to prevent npx from downloading tsx.
- **`describe('isLinkedWorktree')`** — four cases: main tree → `false`, linked worktree → `true`, nested subdirectory → same answer as root, non-git directory → `undefined`.
- **`describe('writesIntoMainFromWorktree')`** — four cases covering worktree→main (true), worktree→worktree (false), main→main (false), and non-git frontend (false).
- **`describe('sync:frontend from a linked worktree')`** — two CLI integration cases proving the guard fires before the staleness gate (`REFUSAL` in stderr, `GATE_REFUSAL` absent) and that `--dry` passes the guard but hits the gate.
- **`sandbox` / `beforeEach` / `afterEach`** — per-test temp directory under `os.tmpdir()`, cleaned up after each case.

## Relationships

- **`scripts/pairing/linked-worktree.ts`** — the module under test; this file imports `isLinkedWorktree` and `writesIntoMainFromWorktree` directly and also exercises them indirectly by spawning the `sync-to-frontend` CLI.
- **`scripts/git-base.ts`** — provides `gitEnvironment()`, used both by the `git` helper and by `runSync` to scrub `GIT_DIR`/`GIT_WORK_TREE` from the process environment.
- **`scripts/pairing/sync-to-frontend.ts`** — invoked as a CLI binary (via `tsx`) in the integration `describe` block; not imported as a module.

## Notes

- **Real git, no stubs.** The file's header explicitly states that stubbing git would "only test the stub"; every case creates actual repos via `git init` / `git worktree add`.
- **`gitEnvironment()` is load-bearing.** Without it, a pre-commit hook's `GIT_DIR`/`GIT_WORK_TREE` env vars would redirect git commands and the CLI's own `isLinkedWorktree` calls to the wrong checkout. Both the `git` helper and `runSync` pass it.
- **Jest timeout raised to 60 s** in the CLI `describe` block because spawning `tsx` from a directory with no `node_modules` is slow on loaded machines.
- **`npm_config_yes=false` + `npm_config_offline=true`** in `runSync` prevent `npx` from downloading `tsx` when the staleness gate invokes it from a directory lacking `node_modules`.
- **Two distinct refusal strings** (`REFUSAL` = guard, `GATE_REFUSAL` = staleness gate) are asserted on stderr to prove execution reached the correct stage of the CLI.
