# scripts/regenerate-artifacts.ts

## Purpose

Orchestrates `npm run regenerate` by running the four committed-artifact generators in the one order that works, then optionally handing the rebuilt files to a paired frontend repo. It exists so the dependency order (openapi → `api/` → seed export) has a single, documented home instead of being implicit in a chain of `&&`.

## Key elements

- **`STEPS`** — ordered array of `{ script, because }` tuples. Defines the four npm scripts to run and a one-line rationale for each:
  1. `contracts:bundle` — bundle per-module OpenAPI/AsyncAPI/analytics sources.
  2. `gen:api` — emit the typed client + Zod schemas under `api/`.
  3. `gen:asyncapi` — emit `src/types/asyncapi.generated.ts`.
  4. `seed:export` — seed a throwaway DB and dump `db/demo/demo-data.json` through the real serializers (depends on `api/` existing).
- **`run(script)`** — wraps `execFileSync('npm', ['run', script])` with `stdio: 'inherit'` so child output serves as the progress report.
- **`skipSync` flag** — set when `--no-sync` is in `process.argv`; suppresses the final `sync:frontend` step.
- **Main loop** — iterates `STEPS`, prints `[regenerate] N/5  <script>` and the `because` line, then calls `run`.
- **Paired-frontend block** (after the loop) — checks `resolveFrontendPath()` with `existsSync`; runs `sync:frontend` if the sibling checkout exists, otherwise logs a skip message pointing to `DEFAULT_FRONTEND_PATH` or `FRONTEND_PATH`.
- **Closing summary** — prints a different hint depending on whether `--no-sync` was used.

## Relationships

- **`scripts/build-contract-bundles.ts`** — executed as the `contracts:bundle` npm script (step 1). Produces the bundled specs that `gen:api` and `gen:asyncapi` consume.
- **`scripts/generate-asyncapi-types.ts`** — executed as the `gen:asyncapi` npm script (step 3). Generates the AsyncAPI type definitions.
- **`scripts/paired-frontend-path.ts`** — imported at the top for `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`; used in the paired-frontend guard to locate the sibling checkout.

## Notes

- Order is **not** arbitrary: `seed:export` imports `@api/schemas.zod` at runtime, so `gen:api` must finish first. Reordering the `STEPS` array will break the seed step.
- The script is idempotent-safe to re-run; it does not delete stale files. `npm run complete` is the verifier.
- `.husky/pre-commit` calls this script with `--no-sync` and stages its output, so a normal commit never touches the paired repo.
- A solo clone (no sibling checkout) still regenerates successfully; the frontend sync is skipped, not fatal. Running `npm run sync:frontend` directly without a sibling will still fail loudly.
