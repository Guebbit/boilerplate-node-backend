---
source: scripts/db/sync-indexes.ts
sha256: 0e1ba3c05408415751894b9f28def6e37f88daf13c02df562a00ece624f68e19
generated_at: 2026-10-14T07:13:34.817123+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/sync-indexes.ts

## Purpose

CLI script (`npm run db:sync`) that reconciles the database's actual indexes with those declared on Mongoose models. It is idempotent, drops any index no schema declares, and supports a `--check` mode that prints the plan without writing—intended as a deploy gate. Serves as the "schema half" of what a migration tool would do.

## Key elements

- **`checkOnly`** — boolean read once from `process.argv`; toggles plan-only vs. apply mode.
- **`describe(diff: IndexDiff): string`** — formats a single collection's pending changes as `+ create` / `- drop` lines.
- **`report(plan, heading)`** — logs the plan (or "nothing to do") via the shared `logger`.
- **`sync()`** — the main async routine: disables `autoIndex`, calls `startJob()`, then either `planIndexSync()` + `report()` (check mode) or `applyIndexSync()` + `report()` (apply mode).
- **`runScript(undefined, sync, cleanup)`** — wraps execution in the standard script lifecycle; `undefined` opts out of D9 job-health tracking.

## Relationships

- **`scripts/db/index-sync.ts`** — provides `applyIndexSync`, `planIndexSync`, and the `IndexDiff` type; this file is its CLI entry point.
- **`scripts/run-script.ts`** — `runScript` supplies the shared connect/cleanup/exit-code scaffolding.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the Mongoose connection; `connection` is passed to the cleanup callback.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — side-effect import that sets Mongoose defaults *before* any model is loaded.
- **`src/infrastructure/config/dotenv.ts`** — side-effect import that loads environment variables first.
- **`src/infrastructure/adapters/logger.ts`** — all user-facing output goes through `logger.info`.

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` must be imported before `mongoose` or any model, because Mongoose reads its defaults at schema-build time.
- **`autoIndex` is disabled here** (unlike everywhere else in the app). Without this, Mongoose would auto-create indexes on connect, making `--check` a write and racing the reconciliation on the apply path.
- **`--check` sets `process.exitCode = 1` directly** rather than throwing, so CI gets a non-zero exit without a stack trace for what is merely an informational outcome.
- **Destructive by design.** Any index not declared in a schema is dropped on the apply path. Run `--check` first against databases you cannot rebuild.
- **Not a recurring job.** The `undefined` passed to `runScript` signals "deploy-time setup script," excluding it from D9's job-health/metric alerts.
