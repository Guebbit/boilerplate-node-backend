---
source: scripts/ops/reap-account-exports.ts
sha256: a3478e730d9c066cc279c86364b5be9f2adee8f8ce685824964a2fa3874ef194
generated_at: 2026-10-14T07:23:14.733668+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-account-exports.ts

## Purpose

Cron-driven ops script that deletes account data exports once they pass their retention window (`NODE_ACCOUNT_EXPORT_TTL_DAYS`, default 7) and sweeps orphaned export files. It exists so stale, regenerable export copies don't accumulate on disk or in Mongo. Invoked via `npm run reap:account-exports`.

## Key elements

- **`main()`** — connects to Mongo via `startJob()`, calls `reapExpiredExports()`, logs the row/file counts, and returns.
- **`runScript('reap:account-exports', main, stopDatabase)`** — top-level entry-point wrapper that records the script's outcome for `/observability/health` and guarantees `stopDatabase` runs on both success and failure paths.
- **Imports (ordered):** `dotenv` → `mongoose-boot` → `database` → `logger` → `account` module → `run-script`. Order matters; see Notes.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, which wraps `main`, records the run outcome under the `reap:account-exports` key, and invokes `stopDatabase` as cleanup.
- **`src/infrastructure/runtime/database.ts`** — `startJob()` opens the Mongo connection before `reapExpiredExports` runs; `stopDatabase` is passed to `runScript` for teardown.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported before any model is loaded so Mongoose connection defaults are in place at schema-build time.
- **`src/infrastructure/config/dotenv.ts`** — loads environment variables (including `NODE_ACCOUNT_EXPORT_TTL_DAYS`) before any other runtime import.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` reports the number of rows and stray files deleted.
- **`src/modules/account/index.ts`** — exports `reapExpiredExports`, the function that actually deletes expired rows and files.
- **`src/modules/account/services/export-rows.ts`** — contains the export-row schema/model that `reapExpiredExports` queries and mutates.

## Notes

- **Import order is load-bearing.** `mongoose-boot` must be imported before any Mongoose model loads; `dotenv` must be first so env vars are available. Do not reorder.
- **Idempotent by design.** A missing file on disk is treated as a no-op, not an error. Safe to run repeatedly or in overlapping windows.
- **Two-phase deletion.** Phase 1 deletes rows whose `readyAt` + TTL has elapsed (and their files). Phase 2 sweeps files no row references (orphaned by a failed delete or abandoned temp file) using file age.
- **Ownership.** This script, the `reap:account-exports` npm script, and its `docker/crontab` entry all belong to the `account` module. Move or rename them together.
