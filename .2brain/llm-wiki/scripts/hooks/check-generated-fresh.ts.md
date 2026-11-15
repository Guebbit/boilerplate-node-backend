---
source: scripts/hooks/check-generated-fresh.ts
sha256: 1ef776f2c99883380df3c89bd2330a1bd12c9c18ef57f6c402daaa340e17390e
generated_at: 2026-11-14T17:35:49.456216+00:00
model: ollama:qwen3.8:27b
---

# scripts/hooks/check-generated-fresh.ts

## Purpose

A pre-commit gate (invoked via `.husky/pre-commit` → `npm run check:generated`) that refuses a commit if any committed generated files are stale. It only *checks* — it never stages files or mutates the working tree.

## Key elements

- **`regenerateIn(tree: string): void`** — Runs `npx tsx scripts/regenerate-artifacts.ts --no-sync` inside the provided scratch copy of the index. Symlinks the repo's `node_modules` into the scratch dir so dependency resolution works as if it were a real directory. Stdio is piped (output suppressed on success).
- **`stale`** — The top-level call to `staleGeneratedFiles({ repo: REPO_ROOT, regenerate: regenerateIn })`; yields the list of generated files that a regeneration would change relative to what is staged.
- **Exit logic** — If `stale.length > 0`, prints the offending paths to stderr and exits `1`; otherwise prints a success line to stdout.

## Relationships

- **`scripts/git-base.ts`** — Imports `gitEnvironment()`, which is passed as the `env` argument to the child `regenerate` process.
- **`scripts/hooks/stale-generated-files.ts`** — Provides `staleGeneratedFiles`, the core comparison logic that decides *which* files are generated and whether they are up-to-date.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT`, used both as the `repo` argument to `staleGeneratedFiles` and as the source of the `node_modules` symlink.

## Notes

- The scratch tree is a *copy of the index* (staged content), not the working tree — that's why the check can reject a commit without touching unsaved changes.
- The `node_modules` symlink is created with `'dir'` type; the regenerate script resolves it identically to a real directory, so no special path handling is needed.
- `stdio: 'pipe'` means regenerate output is buffered and discarded on success; it surfaces only when the process throws (i.e., the run itself fails, not just "files differ").
- The set of checked files is implicitly defined by what `regenerate-artifacts.ts` writes and is *not* gitignored (shared-rules schemas, `shared/authorization-keys.generated.yaml`, `docker/crontab`, `docker/Dockerfile.dockerignore`, `docs/` tables, etc.).
