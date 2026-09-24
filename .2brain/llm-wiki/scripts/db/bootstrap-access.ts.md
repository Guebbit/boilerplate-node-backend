---
source: scripts/db/bootstrap-access.ts
sha256: 978a49c1c2d1d59b424b6554efc1d88176e6d9fb01cadc0134dce0d652c88c03
generated_at: 2026-09-23T17:23:30.898443+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose

One-shot bootstrap script (`npm run access:bootstrap`) that upserts the production "Shop" tenant into a fresh database. It is idempotent (keyed on the fixed `DEPLOYMENT_TENANT_ID`) and safe to re-run, unlike the non-idempotent `scenario:apply` demo-data script. Intended to run once before `app`/`cron` services start (see `docker-compose.production.yml`'s `setup` service).

## Key elements

- **`main`** — local async function; calls `start()`, then `bootstrapAccessModel('Shop')`, then logs the resulting tenant `_id`. Passed to `runScript`.
- **`runScript(main, stopDatabase)`** — top-level entry (invoked with `void`); wraps `main` with the standard connect/teardown lifecycle from `./run-script`.
- **`bootstrapAccessModel('Shop')`** (imported from `@modules/access`) — performs the actual upsert; returns the tenant document including its `_id`.

## Relationships

- **`scripts/db/run-script.ts`** — supplies `runScript`, which orchestrates the script's lifecycle (run `main`, then call `stopDatabase` on completion/error).
- **`src/infrastructure/runtime/database.ts`** — exports `start` (establish the DB connection) and `stopDatabase` (clean shutdown); both are used in the `runScript` call.
- **`src/modules/access/index.ts`** — exports `bootstrapAccessModel`, the function that actually upserts the Shop tenant.
- **`src/infrastructure/adapters/logger.ts`** — exports `logger`; used for the single `info` line confirming the bootstrap and printing the tenant ID.
- **`src/modules/access/service.ts`** — implementation layer behind `bootstrapAccessModel`; the upsert logic keyed on `DEPLOYMENT_TENANT_ID` lives here.

## Notes

- **Idempotency is the design contract.** The upsert key is the fixed `DEPLOYMENT_TENANT_ID`, so re-running is a no-op. This is explicitly called out as the reason no `NODE_ENV === 'production'` guard is needed (contrast with `scenario:apply`).
- **Roles are not stored.** Preset authorization roles are read at import time from `shared/authorization-roles.yaml`; there is no separate "bootstrap roles" step.
- **`dotenv/config` is imported at the top** (side-effect import) so environment variables (e.g. DB connection string) are available before `start()` runs.
- **`void runScript(…)`** — intentional fire-and-forget; the script is a top-level entry point, not a library call.
