---
source: scripts/testing/scratch-copy.ts
sha256: f4e55d0dc6d6ea3177a19355a57e009d8a7ab204fab72fee9bc055f971371853
generated_at: 2026-10-29T01:46:12.985647+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/scratch-copy.ts

## Purpose

Builds a disposable copy of the checkout that the `measure:*` scripts can mutate (strip the shop, scaffold a module) and then run the repo's own checks against. It exists so those destructive experiments never touch the real working tree.

## Key elements

- **`SKIP_ENTRIES`** (const `Set`) — top-level directory names excluded from the copy (`node_modules`, `.git`, `.claude`, `tmp`); they are regenerated or symlinked instead.
- **`runIn(scratch, command, commandArguments)`** (exported) — runs a command with `spawnSync` in the scratch directory. Always returns a boolean (`true` on exit 0); never throws, because a failing command is usually the measurement, not a script bug.
- **`assembleScratchCopy(repoRoot, scratch)`** (exported) — wipes and rebuilds the scratch tree: copies the source (skipping `SKIP_ENTRIES`), symlinks `node_modules`, patches the local `tsconfig.json` to add `"preserveSymlinks": true`, then `git init` + `git add --all` so module-graph tooling (`git ls-files`) works. Throws only if the git steps fail.

## Relationships

- **`scripts/testing/measure-demo-strip.ts`** and **`scripts/testing/measure-scaffold.ts`** — the two `measure:*` consumers. They call `assembleScratchCopy` to get a clean, git-initialized sandbox, make their mutation (strip / scaffold), then use `runIn` to execute the repo's own checks (type-check, lint, etc.) inside it. The scratch tree is disposable by design; the measurement scripts own the mutation, this file owns the setup.

## Notes

- The `scratch` path **must not live inside** `repoRoot`; `fs.cpSync` rejects a destination that is a subdirectory of its own source.
- `node_modules` is symlinked, not copied or reinstalled — the scripts care about the *source* state, not npm resolution.
- The `tsconfig.json` patch (adding `preserveSymlinks`) is a workaround for TS2883: without it, TypeScript refuses to name types reached through the symlinked `node_modules`, which would be a measurement artifact, not a real code issue.
- `git init` is required because the repo's own `regenerate` module-graph step relies on `git ls-files`; a scratch tree without a `.git` directory would break that step.
