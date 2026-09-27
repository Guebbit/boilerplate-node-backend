---
source: scripts/db/bootstrap-access.ts
sha256: 5f33ccb78af3ae36a9f244e677a672175a6782bfaecb7a91c9ed9117d4ff4b97
generated_at: 2026-09-27T13:53:50.106247+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose
Deploy-time script (`npm run access:bootstrap`) that seeds a fresh production database with the shop tenant. It is an idempotent upsert keyed on the fixed `DEPLOYMENT_TENANT_ID`, making it safe to re-run against an already-seeded database—unlike `scenarios/apply.ts`, which creates non-reproducible demo accounts and is therefore blocked in production.

## Key elements
- **`main`** — Starts the DB connection, calls `bootstrapAccessModel('Shop')`, logs the resulting tenant `_id`, and resolves.
- **`runScript(undefined, main, stopDatabase)`** — Invokes the standard script lifecycle (connect → main → cleanup). The `undefined` first argument is the convention that marks this as a deploy-time setup script rather than a `docker/crontab` recurring job.
- **Shebang `#!/usr/bin/env tsx`** — Indicates execution via the `tsx` runner (no separate build step).

## Relationships
- **`scripts/run-script.ts`** — Supplies the `runScript` wrapper that orchestrates DB start, main execution, and graceful shutdown. The `undefined` parameter is interpreted here as "deploy-time, not cron."
- **`src/infrastructure/runtime/database.ts`** — Provides `start()` (open connection) and `stopDatabase()` (close connection) used by the lifecycle wrapper.
- **`src/modules/access/index.ts`** — Re-exports `bootstrapAccessModel`, which this script calls to perform the upsert.
- **`src/modules/access/service.ts`** — Where `bootstrapAccessModel` is implemented; executes the idempotent upsert against the access model collection.
- **`src/infrastructure/adapters/logger.ts`** — Used to emit the single informational log line with the tenant ID for operator records.

## Notes
- **Idempotency is the whole point.** Because the write is an upsert on a fixed tenant ID, no `NODE_ENV` guard is needed. `scenario:apply` *does* need one because its writes are not idempotent.
- **Run before the app.** `docker-compose.production.yml`'s `setup` service executes this script ahead of the `app` and `cron` services.
- **Preset roles are not stored here.** They are read at import time from `shared/authorization-roles.yaml`; no separate role-seeding step exists.
- **No exports.** This is a pure entry-point script; all meaningful work is delegated to `@modules/access`.
