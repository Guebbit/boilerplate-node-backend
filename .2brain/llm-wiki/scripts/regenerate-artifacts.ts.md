---
source: scripts/regenerate-artifacts.ts
sha256: 1b9bcfa68b0e218e914b862f63420be045f0b806e57e10fa7ab704c98fa3ed2b
generated_at: 2026-10-15T09:44:47.265371+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

Entry point for `npm run regenerate`. Rebuilds every generated artifact (typed API client, zod schemas, AsyncAPI bundles, OpenAPI bundle, docs pages, dockerignore) in the one order that satisfies inter-step imports, then optionally hands the rebuilt specs to a paired frontend repo. Exists as a single script rather than a shell `&&` chain because the dependency ordering is non-obvious and needs a home.

## Key elements

- **`STEPS`** — `readonly Step[]` defining the ordered chain of 11 npm scripts (`authorization:bundle` → `gen:permission-actions` → `contracts:bundle` → `gen:api` → `gen:asyncapi` → five `docs:*` steps → `docker:dockerignore`). Each entry carries a `because` string explaining the ordering constraint.
- **`Step`** — interface with `script` (npm script name) and `because` (one-line rationale shown during execution).
- **`run(script)`** — wrapper around `execFileSync('npm', ['run', script])` with `stdio: 'inherit'` and `cwd: REPO_ROOT`.
- **Main loop** — iterates `STEPS`, prints `[regenerate] i/N  script` + `because`, then calls `run`.
- **Final `sync:frontend` block** — conditional on `--no-sync` flag, then on `existsSync(resolveFrontendPath())`. Skips gracefully (non-fatal) when the sibling repo is absent.
- **`skipSync`** — boolean set from `process.argv.includes('--no-sync')`; used by `.husky/pre-commit`.

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` to set the working directory for every `execFileSync` call.
- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH` to locate the paired frontend checkout and to print a helpful hint when it is missing.

## Notes

- Order is load-bearing: `api/` must exist before any step that boots the app (e.g. the `docs:*` steps that read permissions), and `gen:permission-actions` must precede the first bundle that loads the kernel.
- Most outputs are gitignored (`api/`, `src/types/asyncapi.generated.ts`, `openapi.yaml`); only the two AsyncAPI bundles and the `docs:*` pages are committed.
- The sync step is lenient (skips, doesn't fail) so a solo clone can regenerate; `npm run sync:frontend` run directly still fails loudly.
- The closing console message changes wording depending on whether `skipSync` was set, reminding the operator to re-run without `--no-sync` if they meant to push to the frontend.
