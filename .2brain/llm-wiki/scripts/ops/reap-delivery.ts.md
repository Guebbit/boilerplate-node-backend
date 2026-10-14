---
source: scripts/ops/reap-delivery.ts
sha256: d3aeb5d5e3f3817cc6c3d96f91de4ea76b56536c1255f02edc213cf948717c38
generated_at: 2026-10-14T07:23:33.413612+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-delivery.ts

## Purpose

Operational cron script (`npm run reap:delivery`) that wipes the `holdNote` free-text field on fulfillment orders that have not changed for `NODE_HOLD_NOTE_RETENTION_DAYS` (default 365). Structured data (lines, status, dates) is preserved; only the unbounded staff-typed hold note is removed. Exists to satisfy data-retention policy on PII-adjacent free text without deleting the fulfillment order itself.

## Key elements

- **`main`** – Connects via `startJob()`, calls `scrubHoldNotes()` from the delivery module, resolves `undefined`. No return value; the script is fire-and-forget.
- **`runScript('reap:delivery', main, stopDatabase)`** – Entry-point wrapper. Records the outcome under the `reap:delivery` key for `/observability/health` and guarantees `stopDatabase` runs on both success and failure paths.
- **Import order** – `@infrastructure/config/dotenv` is imported first (env vars must exist), then `@infrastructure/runtime/mongoose-boot` (Mongoose defaults are read at schema-build time, so it must precede any model load).

## Relationships

- **`scripts/run-script.ts`** – Provides the `runScript` helper that orchestrates execution, observability logging, and guaranteed DB teardown.
- **`src/infrastructure/config/dotenv.ts`** – Must load before anything else so `NODE_HOLD_NOTE_RETENTION_DAYS` and other env vars are available.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Sets Mongoose connection defaults; must be imported before any model is touched.
- **`src/infrastructure/runtime/database.ts`** – Exports `startJob` (establishes the connection) and `stopDatabase` (closes it).
- **`src/modules/delivery/index.ts`** – Exports `scrubHoldNotes`, the actual retention logic invoked by this script.
- **`src/modules/delivery/services/retention.ts`** – Implementation behind `scrubHoldNotes`; contains the query filter and unset operation.

## Notes

- **Import order is load-bearing.** `dotenv` → `mongoose-boot` → models is the required sequence; reordering breaks schema defaults.
- **Clock is `updatedAt`, not a close date.** A fulfillment order held indefinitely never "closes," so `updatedAt` is the only reliable staleness signal.
- **Idempotent / safe to re-run.** The query only matches orders that still have a note; the wipe does not bump `updatedAt`, so a second run within the same window is a no-op.
- **Cron-only.** Intended for the shared `reap:*` cron container, never on application boot.
- **Removal ownership.** Deleting this script is the responsibility of the `delivery` module (along with its `reap:delivery` npm script and `docker/crontab` line).
