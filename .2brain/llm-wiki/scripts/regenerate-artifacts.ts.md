---
source: scripts/regenerate-artifacts.ts
sha256: 46e0bf244dc7a95d9849e59c06e790137e07299c298d04365031e78901166a1b
generated_at: 2026-10-01T12:37:52.919072+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

Sequentially regenerates every derived artifact in the repo (API client, typed schemas, AsyncAPI bundles, docs pages, Docker ignore) in a strict dependency order, then optionally hands backend-owned files to a paired frontend checkout. Exists as a single ordered script because the step order is non-obvious and must live in one place; also invoked automatically by `.husky/pre-commit` with `--no-sync` so `npm run complete` only ever *verifies*.

## Key elements

- **`REPO_ROOT`** – Resolves the repo root (parent of `scripts/`) so every child `npm run` executes from a fixed cwd regardless of caller location.
- **`skipSync`** – Boolean from `--no-sync` in `process.argv`; suppresses the final paired-frontend handoff.
- **`Step` interface** – `{ script: string; because: string }`; pairs an npm script name with a one-line justification shown at runtime.
- **`STEPS` (readonly array, 12 entries)** – The ordered chain: `authorization:bundle` → `gen:permission-actions` → `contracts:bundle` → `gen:api` → `gen:asyncapi` → five `docs:*` steps → `docker:dockerignore`. Order encodes real import/boot dependencies (e.g. `api/` must exist before the app boots to read docs).
- **`run(script)`** – Wraps `execFileSync('npm', ['run', script], { cwd: REPO_ROOT, stdio: 'inherit' })`; child output streams directly to the terminal as the progress report.
- **Main loop** – Iterates `STEPS`, prints index/total + the `because` line, then calls `run`.
- **Paired-frontend tail** – After all STEPS, checks `existsSync(resolveFrontendPath())`; if present and not `skipSync`, runs `sync:frontend`. Absent checkout is a skip, not an error (solo-clone safety).

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** – Imports `resolveFrontendPath()` (returns the resolved sibling-frontend directory) and `DEFAULT_FRONTEND_PATH` (used in the "skipped" diagnostic message). This is the sole cross-file dependency; the script does not otherwise import from the codebase.

## Notes

- **Order is load-bearing.** `gen:permission-actions` must precede `contracts:bundle` because the bundler boots the kernel, which imports the generated permission-actions file. Reordering or removing steps will break a clean checkout.
- **`--no-sync` is not "skip everything."** All 12 STEPS still run; only the final `sync:frontend` is skipped. The closing message reminds the user to run without the flag when they intend to hand files over.
- **Paired repo is optional.** The script never fails if the sibling directory is missing; it prints the expected path (or the `FRONTEND_PATH` override hint) and continues. `npm run sync:frontend` run in isolation *does* fail loudly.
- **Not a chain of `&&`.** Deliberately a loop so the `because` rationale is co-located with each step and the count is derived from the array length.
- **Idempotent by design.** Safe to run repeatedly; `npm run complete` (the verify path) is a separate, cheaper check.
