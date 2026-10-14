---
source: scripts/db/bootstrap-access.ts
sha256: 5154cca94103d27cd4a24a4e6fc3269a49953d251888690866e796928fc59bf7
generated_at: 2026-10-14T07:12:39.394815+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose

Production-safe, idempotent bootstrap script (`npm run access:bootstrap`) that upserts the fixed "Shop" tenant into a fresh database. It exists as the safe counterpart to `scenarios/apply.ts`: because the write is keyed on `DEPLOYMENT_TENANT_ID`, re-running it is a no-op, so no `NODE_ENV` guard is required. Intended to run once before the app or cron services start (see `docker-compose.production.yml` → `setup` service).

## Key elements

- **`main`** – Connects via `startJob()`, calls `bootstrapAccessModel('Shop')`, logs the resulting tenant `_id` for operator records.
- **`runScript(undefined, main, stopDatabase)`** – Wraps execution in the shared script harness; the `undefined` first argument marks it as a one-shot deploy-time script (not a cron job) and registers `stopDatabase` as the cleanup callback.
- **Import ordering** – `@infrastructure/config/dotenv` loads first, then `@infrastructure/runtime/mongoose-boot` *before any Mongoose model is imported*, because Mongoose connection defaults are read at schema-build time.

## Relationships

- **`scripts/run-script.ts`** – Provides the `runScript` wrapper that handles process lifecycle (signal trapping, exit codes) around the script body.
- **`src/infrastructure/runtime/database.ts`** – Supplies `startJob` (opens the DB connection) and `stopDatabase` (graceful close passed to `runScript`).
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Sets Mongoose defaults (e.g., `strictQuery`, `strictPopulate`) before any model schema is built; must be imported before `@modules/access`.
- **`src/infrastructure/config/dotenv.ts`** – Loads environment variables; imported first so all subsequent modules see a populated `process.env`.
- **`src/infrastructure/adapters/logger.ts`** – Provides the structured `logger` used for the single info message.
- **`src/modules/access/index.ts`** – Exports `bootstrapAccessModel`, the upsert logic for the Shop tenant.
- **`src/modules/access/service.ts`** – Underlying service that `bootstrapAccessModel` delegates to for the actual upsert.

## Notes

- **Import order is load-bearing.** If `@modules/access` (or anything that pulls in a Mongoose model) is imported before `mongoose-boot`, Mongoose defaults will be locked in at wrong values. Keep the two infrastructure imports at the top.
- **No `NODE_ENV === 'production'` guard.** Deliberate — the script is idempotent by design, unlike `scenario:apply` which mutates demo accounts and *does* guard.
- **Preset roles are not stored.** They are read from `shared/authorization-roles.yaml` at import time by the access module; this script only creates the tenant document.
- **`runScript` first arg is `undefined`** (not a cron expression). This tells the harness to treat the process as a one-shot job and exit after `main` settles.
