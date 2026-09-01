# scripts/regenerate-artifacts.ts

## Purpose

Sequentially rebuilds every generated artifact the repo commits (typed API client, zod schemas, asyncapi types, module graph, seed data) in the one order that satisfies their internal dependencies. Exists as a single ordered script because the chain is non-obvious and needs a home; also invoked by the husky pre-commit hook with `--no-sync`.

## Key elements

- **`STEPS`** — Ordered array of `{ script, because }` pairs defining the regeneration chain: `contracts:bundle` → `gen:api` → `gen:asyncapi` → `docs:graph` → `seed:export`.
- **`run(script)`** — Executes `npm run <script>` via `execFileSync` with inherited stdio so each step's own output serves as the progress log.
- **`skipSync`** — Derived from the `--no-sync` argv flag; when true the final frontend-sync step is skipped entirely.
- **Frontend-sync block** (after the loop) — Conditionally runs `npm run sync:frontend` if the paired frontend checkout exists on disk, otherwise logs a skip with the expected path.
- **`resolveFrontendPath()` / `DEFAULT_FRONTEND_PATH`** — Imported from `./paired-frontend-path` to locate the sibling frontend repo (honors `FRONTEND_PATH` in `.env`).

## Relationships

- **`scripts/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` (resolves the sibling checkout path) and `DEFAULT_FRONTEND_PATH` (the fallback location used in the skip message). This file calls both to decide whether the final `sync:frontend` step can run.

## Notes

- Order is load-bearing: `seed:export` runs the real application whose models import `@api/schemas.zod`, so `gen:api` (step 2) must complete first.
- The paired-frontend step is **skipped, not fatal**, when the sibling repo is absent — a solo clone must still regenerate. `npm run sync:frontend` on its own still fails loudly.
- Client collections that read `demo-data.json` are intentionally **not** a step here because they are not committed.
- The final console message differs based on `skipSync` to remind the developer whether the frontend received the rebuilt files.
