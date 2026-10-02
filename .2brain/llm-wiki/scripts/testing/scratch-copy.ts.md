---
source: scripts/testing/scratch-copy.ts
sha256: 092abc43a9362b705b76d547944549ae168e916b81d9eddada9a9b1401a17ca8
generated_at: 2026-10-01T12:41:48.606823+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/scratch-copy.ts

## Purpose

Builds a disposable copy of the checkout into a scratch directory so that `measure:*` scripts can destructively mutate it (strip the shop, scaffold a module) and then run the repo's own checks against the result—without touching the real working tree.

## Key elements

- **`SKIP_ENTRIES`** — Set of top-level entries excluded from the copy (`node_modules`, `.git`, `.claude`, `tmp`); each is handled separately.
- **`runIn(scratch, command, args) → boolean`** — Spawns a command with `cwd` set to the scratch root; returns `true` on exit code 0. Never throws: a non-zero exit is the *measurement*, not a script failure.
- **`assembleScratchCopy(repoRoot, scratch) → void`** — Wipes and rebuilds the scratch tree:
  1. `cpSync` the checkout, filtering out `SKIP_ENTRIES`.
  2. Symlink `node_modules` from the original into the scratch (avoids reinstall).
  3. Patch `tsconfig.json` to add `"preserveSymlinks": true` so TypeScript doesn't emit TS2883 for types reached through the symlink.
  4. `git init` + `git add --all` so tools that call `git ls-files` (e.g. `docs:graph`) work inside the scratch.

## Relationships

- **`scripts/testing/measure-demo-strip.ts`** — Consumer. Calls `assembleScratchCopy` to get a pristine scratch tree, then mutates it (removes the shop) and uses `runIn` to execute the repo's checks.
- **`scripts/testing/measure-scaffold.ts`** — Consumer. Same pattern: `assembleScratchCopy` → scaffold a module into the scratch → `runIn` the checks.

## Notes

- `scratch` **must** live outside `repoRoot`; `fs.cpSync` throws if the destination is a subdirectory of its source.
- The tsconfig patch is a literal string replace of `"strict": true,`. If that line's formatting ever changes, the patch silently fails and TS2883 will reappear.
- The module exports only `runIn` and `assembleScratchCopy` (declared `@module`); no default export.
