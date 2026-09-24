---
source: scripts/regenerate-artifacts.ts
sha256: 472263fe231b49f4dd1b1d5d7f7d4c0739bdc5c6ca31beb063f6e731d9fb6ed4
generated_at: 2026-09-23T17:31:47.678912+00:00
model: ollama:qwen3.8:27b
---

# scripts/regenerate-artifacts.ts

## Purpose

Rebuilds every generated artifact in the repo in the one correct dependency order (invoked as `npm run regenerate`). It exists as a single script rather than a shell chain because the ordering constraints are non-obvious and need a durable home. Most outputs are gitignored (`api/`, `src/types/asyncapi.generated.ts`); the contract bundles and docs pages it rewrites are committed exceptions.

## Key elements

- **`STEPS`** — `readonly Step[]` array encoding the regeneration chain: `contracts:bundle` → `gen:api` → `gen:asyncapi` → `docs:graph` → `docs:roles` → `docs:dependencies` → `docs:rate-limits` → `docker:dockerignore`. Each entry carries a `because` string shown as the step progresses.
- **`run(script)`** — executes `npm run <script>` via `execFileSync` with `stdio: 'inherit'` from `REPO_ROOT`.
- **`skipSync`** — derived from `--no-sync` in `process.argv`; when true the paired-frontend handoff is skipped entirely.
- **`REPO_ROOT`** — resolved from `__dirname/..`; all npm calls run from here regardless of caller cwd.
- **Paired-frontend sync block** (bottom) — runs `sync:frontend` last, only if the sibling checkout exists on disk. Skipped (not fatal) when absent; `resolveFrontendPath()` determines the path, `DEFAULT_FRONTEND_PATH` is used in the diagnostic message.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`. `resolveFrontendPath()` is used in the `existsSync` guard and in the "expected at" diagnostic; `DEFAULT_FRONTEND_PATH` appears in the user-facing hint when the sibling is missing. The frontend sync step depends on the files this script has already rebuilt (contract bundles, specs), which is why it is ordered last.

## Notes

- The order is not arbitrary: `gen:api` must precede any step whose output depends on `api/` (e.g. the app's own models import `@api/schemas.zod`). The chain is "the only order that works."
- `.husky/pre-commit` invokes this script with `--no-sync` and stages its output, so `npm run complete` only _verifies_—it does not regenerate.
- The paired-frontend sync is deliberately lenient (skip, not fail) so a solo clone can regenerate; `sync:frontend` run standalone still fails loudly if the peer is missing.
- Client collections read `scenarios/subjects.ts` rather than a generated dataset and are intentionally excluded from this chain.
- See `docs/api/regenerating.md` for the longer narrative on why each step sits where it does.
