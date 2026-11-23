---
source: scripts/testing/scratch-copy.ts
source_sha256: e7a75687966119d91be94a796a62b6757592ea7130b24e85e777946bfe80cc83
context_sha256: cea576e315214a36b725bd140f0c3358f784f5c07f3d137d3dd22906d9f13eba
generated_at: 2026-11-22T02:20:08.636668+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/scratch-copy.ts

## Purpose
Builds a disposable copy of the checkout that the `measure:*` scripts can freely damage (strip the shop, scaffold a module) before running the repo's own checks against what remains. The measurement concerns the state of the *source* after a change, so dependencies are symlinked rather than reinstalled.

## Key elements
- `runIn(scratch, command, commandArguments)` — runs a command in the scratch root via `spawnSync` with inherited stdio. Returns `true` only if it exits 0 and never throws, since a failing command is usually the measurement itself. The environment comes from `gitEnvironment()`, which drops every `GIT_*` variable.
- `assembleScratchCopy(repoRoot, scratch)` — wipes and recreates `scratch`, then:
  1. Copies `repoRoot` with `cpSync`, skipping the top-level entries `node_modules`, `.git`, `.claude` and `tmp` (`SKIP_ENTRIES`).
  2. Symlinks the real `node_modules` into the scratch tree.
  3. Patches the copied `tsconfig.json` to add `"preserveSymlinks": true` after `"strict": true,`.
  4. Runs `git init --quiet` and `git add --all`. It throws an `Error` if either fails.

## Relationships
- `scripts/git-base.ts` — supplies `gitEnvironment()`, used by `runIn` so git commands in the scratch folder cannot touch the real repository's index when run under a git hook.
- `scripts/testing/measure-scaffold.ts` — a neighbor in the graph, presumably a consumer of this module's scratch copy.
- `tests/unit/scripts/testing/scratch-copy.test.ts` — unit tests for this module.

## Notes
- `scratch` must be **outside** `repoRoot`, because `fs.cpSync` refuses a destination inside its own source.
- `preserveSymlinks` works around TS2883: a symlinked `node_modules` resolves outside the scratch tree, and TypeScript then refuses to name types reached through it. The patch is a plain string replace, so it silently does nothing if `tsconfig.json` has no exact `"strict": true,` text.
- The scratch copy is made a git repository because `regenerate`'s module-graph step uses `git ls-files` to find which files each module owns.
