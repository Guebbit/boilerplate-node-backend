---
source: scripts/ops/reap-returns.ts
sha256: ab2a4ecdb30ee2bc888173bce87e10cc660a4c94f9d6aa1a6b189880bb753a99
generated_at: 2026-10-14T07:26:28.175399+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-returns.ts

## Purpose

Periodic ops script (`npm run reap:returns`) that clears the unbounded free-text fields (`note`, `declineReason`) on returns whose `updatedAt` is older than `NODE_RETURN_TEXT_RETENTION_DAYS` (default 1095). Returns themselves are never deleted; structured fields (status, lines, amounts, dates) are preserved.

## Key elements

- **`main()`** — calls `startJob()`, then `returnService.scrubReturnText()`, then resolves to `undefined`. All error/connection handling is delegated to the `runScript` wrapper.
- **`runScript('reap:returns', main, stopDatabase)`** — top-level entry point. Executes `main`, records the outcome under the `reap:returns` key for the health endpoint, and closes DB connections on both success and failure paths.
- **Import order (critical):** `@infrastructure/config/dotenv` → `@infrastructure/runtime/mongoose-boot` → remaining imports. Mongoose schema defaults are read at build time, so the boot module must load before any model import.
- **`NODE_RETURN_TEXT_RETENTION_DAYS`** — env var controlling the staleness window; consumed downstream by `scrubReturnText`.

## Relationships

- **`scripts/run-script.ts`** — supplies the `runScript` helper that wraps execution, reports to `/observability/health`, and guarantees `stopDatabase` is called on both paths.
- **`src/infrastructure/config/dotenv.ts`** — first import; populates process env (including the retention-days variable) before any other module reads it.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — second import; applies Mongoose connection defaults before schema construction.
- **`src/infrastructure/runtime/database.ts`** — provides `startJob` (acquire connection + job lifecycle) and `stopDatabase` (teardown).
- **`src/modules/returns/index.ts`** → **`src/modules/returns/services/index.ts`** — re-exports `returnService`; the `scrubReturnText()` method here performs the actual query-and-clear against the returns collection.

## Notes

- **Clock is `updatedAt`, not the return's closing date.** An approved return whose goods never arrive never "closes," so a close-date filter would never reach it.
- **Idempotent by design:** the filter only matches returns that still hold text, and the wipe does not advance `updatedAt`. Safe to re-run.
- **Intentionally decoupled from the order-scrub pipeline:** that pipeline's clock starts at account erasure and never covers live customers.
- **Cron-only:** runs in the same periodic container as the other `reap:*` scripts; never invoked at application boot.
- **Removal is owned by the `returns` module:** deleting the module also removes this script, the `reap:returns` npm alias, and its `docker/crontab` line.
