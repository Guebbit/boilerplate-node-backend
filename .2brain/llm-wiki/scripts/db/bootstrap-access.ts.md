---
source: scripts/db/bootstrap-access.ts
sha256: ee1d70b8cd0d29274dd0903e58b531809e47d148e23695bd3ce2879b9e0cb3f0
generated_at: 2026-11-08T02:45:26.514019+00:00
model: ollama:qwen3.8:27b
---

# scripts/db/bootstrap-access.ts

## Purpose

Deploy-time setup script (`npm run access:bootstrap`) that upserts the fixed "Shop" tenant into a fresh production database. Because the write is an idempotent upsert keyed on `DEPLOYMENT_TENANT_ID`, it is safe to re-run at any time — no `NODE_ENV` guard required. Runs before `app`/`cron` start via the `setup` service in `docker-compose.production.yml`.

## Key elements

- **`main()`** — Connects via `startJob()`, calls `accessService.bootstrapAccess('Shop')`, and logs the resulting tenant `_id` for operator records.
- **`runScript(undefined, main, stopDatabase)`** — Wires `main` as a deploy-time setup job (not a crontab job); `stopDatabase` is the cleanup callback. The `undefined` first argument is the convention that distinguishes setup scripts from scheduled ones.
- **Import ordering** — `dotenv` → `mongoose-boot` → `database` → `access` → `logger` → `run-script`. Mongoose defaults are read at schema build time, so `mongoose-boot` must precede any model import.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` wrapper that manages process lifecycle and exit-code reporting; this file passes `undefined` as the schedule argument to mark itself as a one-shot setup step.
- **`src/infrastructure/runtime/database.ts`** — Source of `startJob()` (DB connect) and `stopDatabase()` (teardown passed to `runScript`).
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Configures Mongoose global defaults before any schema is built.
- **`src/infrastructure/config/dotenv.ts`** — Loads environment variables; must be the first import.
- **`src/modules/access/index.ts`** — Exports `accessService`, whose `bootstrapAccess(name)` method performs the actual upsert.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used for the single info-level log line.

## Notes

- The script is explicitly **idempotent** (upsert on a fixed key). This is what makes it production-safe without an env guard, in contrast to `scenarios/apply.ts` which is not.
- **Preset roles are not stored** by this script; they are read from `shared/authorization-roles.yaml` at module import time.
- The `eslint-disable` for `@typescript-eslint/no-floating-promises` is intentional: `runScript` never rejects; failures surface via `process.exitCode`.
- The `void` before `runScript` is the type-level acknowledgment of that never-rejecting contract.
