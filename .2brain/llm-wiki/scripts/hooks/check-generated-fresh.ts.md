---
source: scripts/hooks/check-generated-fresh.ts
sha256: 70a16dae696c0e858441393ab275a6d9a3849551f11cfe8ab889ca76de8beb65
generated_at: 2026-11-08T02:51:35.570281+00:00
model: ollama:qwen3.8:27b
---

# scripts/hooks/check-generated-fresh.ts

## Purpose

Pre-commit gate (invoked via `.husky/pre-commit` as `npm run check:generated`) that refuses a commit when any committed generated file is stale. It is check-only: it never stages files or mutates the working tree.

## Key elements

- **`regenerateIn(tree)`** — Runs `npx tsx scripts/regenerate-artifacts.ts --no-sync` inside a scratch copy of the index. First symlinks `node_modules` from `REPO_ROOT` into the scratch tree so dependency resolution matches a real checkout. Stdio is piped; output surfaces only if the child process fails (non-zero exit throws).
- **`stale`** — Result of `staleGeneratedFiles({ repo: REPO_ROOT, regenerate: regenerateIn })`. An array of file paths that a regeneration would change relative to what is being committed.
- **Main body** — If `stale` is non-empty, prints the list to stderr with a hint to run `npm run regenerate`, then `process.exit(1)`. Otherwise logs a success line to stdout.

## Relationships

- **`scripts/git-base.ts`** — Provides `gitEnvironment()`, the sanitized env object passed to the child process so it sees the staged index (not the working tree).
- **`scripts/hooks/stale-generated-files.ts`** — Supplies `staleGeneratedFiles()`, the core diff logic. This file is a thin CLI wrapper around it.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, used to resolve the `node_modules` symlink target and to pass as the `repo` option.

## Notes

- The module is `@module`-scoped with no exports; it is purely an entrypoint script (shebang `#!/usr/bin/env tsx`).
- The `symlinkSync` call is required because the scratch tree is not a real git checkout, so `node_modules` won't exist there naturally. The symlink uses type `'dir'`.
- Generated files covered include shared-rules schemas, `shared/authorization-keys.yaml`, `docker/crontab`, `docker/Dockerfile.dockerignore`, and tables under `docs/` (whatever `regenerate` writes that is not gitignored).
- See `docs/api/regenerating.md#the-pre-commit-hook` for the broader contract.
