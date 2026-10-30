---
source: scripts/db/bootstrap-access.ts
sha256: ee1d70b8cd0d29274dd0903e58b531809e47d148e23695bd3ce2879b9e0cb3f0
generated_at: 2026-10-29T01:32:23.760816+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose

Deploy-time bootstrap script that seeds the production "Shop" tenant into a fresh database. Unlike `scenarios/apply.ts`, it is safe to re-run in production because the write is an idempotent upsert keyed on a fixed deployment tenant ID. Intended to run before the app or cron services start (see `docker-compose.production.yml` → `setup` service).

## Key elements

- **`main`** — Connects via `startJob()`, calls `accessService.bootstrapAccess('Shop')`, logs the resulting tenant ID, and relies on `stopDatabase` for cleanup.
- **Side-effect imports** — `@infrastructure/config/dotenv` (env loading) and `@infrastructure/runtime/mongoose-boot` (Mongoose default options) must be imported *before* any model or service is touched; their order in the file is deliberate.
- **`runScript(undefined, main, stopDatabase)`** — Entry-point wrapper. The `undefined` first argument marks this as a one-shot deploy script rather than a scheduled job.

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, which handles process-lifecycle concerns (exit codes, unhandled-rejection trapping) around the `main` callback.
- **`src/infrastructure/config/dotenv.ts`** — Imported as a side effect; must load before any `process.env` reads in downstream modules.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported as a side effect; sets Mongoose connection defaults before any schema is built.
- **`src/infrastructure/runtime/database.ts`** — Supplies `startJob` (establishes DB connection) and `stopDatabase` (graceful teardown passed to `runScript`).
- **`src/modules/access/index.ts`** — Exports `accessService`, the single entry point this script uses to perform the upsert.
- **`src/modules/access/services/index.ts`** — Defines the `bootstrapAccess` method called by `accessService`; contains the actual upsert logic keyed on the deployment tenant.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used to record the bootstrapped tenant ID.

## Notes

- **Import order matters.** `dotenv` and `mongoose-boot` must precede the `database` / `access` imports; reordering them will break Mongoose default resolution at schema-build time.
- **No `NODE_ENV` guard.** The script is safe under `production` by design (idempotent upsert). Do not add a production check that would block it — that is the whole point of separating this from `scenario:apply`.
- **Preset roles are *not* persisted here.** They are read from `shared/authorization-roles.yaml` at import time; this script only creates the tenant document.
- **Not a cron job.** The `undefined` argument to `runScript` signals "deploy-time, run once." Do not wire this into `docker/crontab`.
