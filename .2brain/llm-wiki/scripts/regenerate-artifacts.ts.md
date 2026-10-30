---
source: scripts/regenerate-artifacts.ts
sha256: a83236a08d0e05f15637edbcf6291709e39c74cd951bfbcfc7ea727f87575e44
generated_at: 2026-10-29T01:41:19.729353+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

Orchestrates the full regeneration of every generated artifact in the repo (`npm run regenerate`). It runs a fixed, order-sensitive chain of generator commands—openapi → typed client → asyncapi → docs tables—and then optionally hands backend-owned files to a paired frontend repo. Also serves as the `--check` verifier (half of `npm run check`), where each step that supports it is run in verify-only mode and nothing is written.

## Key elements

- **`STEPS`** — `readonly Step[]`; the ordered chain of 15 generator commands. Each entry carries a `name`, the `command` tuple, a `checks` boolean (whether the step understands `--check`), and a one-line `because` shown as the run proceeds.
- **`Step`** (interface) — shape of one entry in `STEPS`: `name`, `command`, `checks`, `because`.
- **`run(command)`** — executes a command via `execFileSync` with `cwd: REPO_ROOT` and `stdio: 'inherit'`; the child's own stdout is the progress output.
- **`handOver()`** — final step: syncs rebuilt files to the paired frontend via `npm run sync:frontend`. Skipped under `--no-sync` or when the sibling checkout is absent.
- **`skipSync` / `checkOnly`** — booleans derived from CLI flags; gate the final sync and filter `STEPS` to check-capable entries respectively.
- **Main loop** — iterates (filtered) steps, prints `[regenerate] n/N  name` + `because`, then calls `run` with `--check` appended when in verify mode.

## Relationships

- **`scripts/cli.ts`** — imports `hasFlag` to parse the `--no-sync` flag from `process.argv`.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` so every child process runs from the repository root regardless of the caller's cwd.
- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` to locate (and, if present, sync to) the sibling frontend checkout.

## Notes

- **Order is load-bearing.** `api/` (step 6) must exist before any app code that imports `@api/schemas.zod` can run; `gen:permission-actions` (step 3) and `shared rules` (step 4) must precede the first bundle that loads the kernel. Reordering steps will break a clean-checkout build.
- **`--check` does not cover every step.** Steps with `checks: false` (`gen:api`, `gen:asyncapi`) are silently skipped during a verify run; those are validated by their own unit/integration tests instead.
- **Lenient on missing frontend.** A solo clone (no sibling checkout) can still regenerate successfully; the sync step is skipped with a hint rather than erroring. `npm run sync:frontend` on its own still fails loudly if the path is wrong.
- **Most outputs are gitignored.** The committed exceptions are the two AsyncAPI bundles and the docs pages the generators rewrite.
- **Husky integration.** `.husky/pre-commit` invokes this script with `--no-sync`, so `npm run check` only ever verifies already-committed artifacts.
