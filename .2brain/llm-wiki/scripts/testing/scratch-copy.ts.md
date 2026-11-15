---
source: scripts/testing/scratch-copy.ts
sha256: 508a0a604ee35fad3f7b8b0177631f67ba0878ab56df697bb7dbc6ee0757bfeb
generated_at: 2026-11-14T17:43:29.772496+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/scratch-copy.ts

## Purpose

Provides a disposable copy of the repo checkout that the `measure:*` scripts can mutate (strip a shop, scaffold a module) and then run the repo's own checks against. The copy isolates destructive experiments from the real working tree so the measurement reflects the source change, not an environment failure.

## Key elements

- **`SKIP_ENTRIES`** – Set of top-level paths (`node_modules`, `.git`, `.claude`, `tmp`) excluded from the `cpSync` copy; they are regenerated or symlinked instead.
- **`runIn(scratch, command, commandArguments)`** – Runs a command with `cwd` set to the scratch tree via `spawnSync`. Returns a boolean (exit 0 = success). Never throws, because a non-zero exit is typically the measurement result, not a script bug. Uses `gitEnvironment()` from `git-base` to strip `GIT_*` variables.
- **`assembleScratchCopy(repoRoot, scratch)`** – Wipes and rebuilds the scratch directory: copies the checkout (skipping `SKIP_ENTRIES`), symlinks `node_modules`, injects `"preserveSymlinks": true` into the scratch `tsconfig.json`, then runs `git init` + `git add --all` inside the scratch so downstream tools (e.g. `regenerate`'s module-graph step) can use `git ls-files`. Throws if the git setup fails.

## Relationships

- **`scripts/git-base.ts`** – Imports `gitEnvironment`, which builds an env object with all `GIT_*` variables removed. This prevents `git add --all` in the scratch tree from accidentally hitting the real repo's index when the script runs under a git hook.
- **`scripts/testing/measure-scaffold.ts`** – Primary consumer. Calls `assembleScratchCopy` to obtain the workspace, makes its scaffold mutation, then invokes `runIn` to execute the repo's own checks (type-check, lint, etc.) and record the result.
- **`tests/unit/scripts/testing/scratch-copy.test.ts`** – Unit tests exercising `assembleScratchCopy` and `runIn` in isolation.

## Notes

- **Scratch location matters.** `scratch` must live *outside* `repoRoot`; `fs.cpSync` throws if the destination is a subdirectory of the source.
- **`node_modules` is a symlink, not a copy.** This keeps setup fast and avoids a redundant `npm install`, but it introduces a TypeScript resolution quirk: types reached through the link trigger TS2883 ("an artifact of the measurement, not of the code"). The file patches the scratch `tsconfig.json` to add `"preserveSymlinks": true` to work around this.
- **`runIn` never throws.** Callers get a `true`/`false` and must decide whether a non-zero exit is an expected measurement or a real error. Do not rely on `try/catch` around it.
- **Git in scratch is minimal.** Only `init` + `add --all` run; there is no commit, no remote, and no config beyond what `gitEnvironment` supplies.
