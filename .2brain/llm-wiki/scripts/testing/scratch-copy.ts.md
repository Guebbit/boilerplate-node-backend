---
source: scripts/testing/scratch-copy.ts
sha256: f4e55d0dc6d6ea3177a19355a57e009d8a7ab204fab72fee9bc055f971371853
generated_at: 2026-11-08T03:03:46.889351+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/scratch-copy.ts

## Purpose

Provides utilities to build a disposable scratch copy of the repository checkout so that `measure:*` scripts can destructively modify it (strip a shop, scaffold a module) and run the repo's own checks against the result without touching the real tree.

## Key elements

- **`SKIP_ENTRIES`** – Set of top-level paths (`node_modules`, `.git`, `.claude`, `tmp`) excluded from the copy; they are regenerated or symlinked instead.
- **`runIn(scratch, command, commandArguments)`** – Runs a child process with `cwd` set to the scratch root. Returns `true` on exit 0; never throws, because a failing command is typically the measurement itself.
- **`assembleScratchCopy(repoRoot, scratch)`** – Wipes and rebuilds `scratch` as a copy of `repoRoot`:
  1. Copies the tree (respecting `SKIP_ENTRIES` via `cpSync` filter).
  2. Symlinks `node_modules` from the real checkout (no reinstall).
  3. Patches `tsconfig.json` to inject `"preserveSymlinks": true` so TypeScript resolves types through the symlink (avoids TS2883).
  4. Runs `git init --quiet` and `git add --all` so downstream tools that query `git ls-files` see the scratch tree as a repository.
  - Throws only if the git init/add steps fail.

## Relationships

- **`scripts/testing/measure-scaffold.ts`** — Consumes `assembleScratchCopy` to obtain a mutable copy, then uses `runIn` to execute the repo's own checks (type-check, lint, etc.) inside it after making a scaffold modification.

## Notes

- `scratch` **must** live outside `repoRoot`; `fs.cpSync` refuses a destination that is a subdirectory of its own source.
- The `preserveSymlinks` patch is a targeted string replacement on `"strict": true,` in the copied `tsconfig.json`. If that exact literal is ever removed or reformatted, the patch silently becomes a no-op and TS2883 will resurface.
- `runIn` uses `stdio: 'inherit'`, so child-process output goes straight to the parent's stdout/stderr.
