---
source: scripts/db/bootstrap-access.ts
sha256: 6214491a3f4e35ab011a22fe766e1048dfd2b6946273d6dec30f7ded5bdb98f2
generated_at: 2026-11-14T17:30:03.518418+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose

One-shot production bootstrap script (`npm run access:bootstrap`) that creates the initial "Shop" tenant via an idempotent upsert. Intended to run as the `setup` service in `docker-compose.production.yml` before the `app` and `cron` containers start. Unlike `scenarios/apply.ts`, it is safe to re-run against an already-seeded database because the write is keyed on the fixed `DEPLOYMENT_TENANT_ID`.

## Key elements

- **`main`** — Connects the database (`startJob`), calls `accessService.bootstrapAccess('Shop')`, logs the resulting tenant ID, then hands shutdown back to `runScript`.
- **`runScript(undefined, main, stopDatabase)`** — Wraps `main` with process-exit and error-handling conventions. The `undefined` first argument marks this as a deploy-time script (not a `docker/crontab` job).
- **Import ordering** — `@infrastructure/config/dotenv` and `@infrastructure/runtime/mongoose-boot` are imported before anything else so Mongoose schema defaults are applied at build time.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — Loaded first; populates environment variables before any other module reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Loaded second; sets Mongoose connection defaults that are captured at schema-definition time.
- **`src/infrastructure/runtime/database.ts`** — Provides `startJob` (connect) and `stopDatabase` (disconnect) used by `main` and passed to `runScript`.
- **`src/modules/access/index.ts`** — Exports `accessService`, whose `bootstrapAccess` method performs the actual upsert.
- **`src/modules/access/services/index.ts`** — The service layer behind `accessService`; holds the `bootstrapAccess` implementation.
- **`scripts/run-script.ts`** — Generic script runner; handles top-level error catching, process-exit-code, and graceful shutdown.

## Notes

- **No `NODE_ENV` guard** is present intentionally: the upsert is idempotent, so there is no destructive path to protect against. This is the explicit contrast with `scenario:apply`, which *does* guard against production.
- **Preset roles are not created here.** They are read from `shared/rules/authorization-roles.yaml` at import time and are never persisted to the database.
- **Eslint suppression** on the `void runScript(...)` line documents that `runScript` signals failure via `process.exitCode` rather than rejecting, so the floating promise is intentional.
- The script is a **deploy-time one-shot**, not a scheduled job; the `undefined` argument to `runScript` encodes that distinction.
