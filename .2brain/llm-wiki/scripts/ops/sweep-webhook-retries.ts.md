---
source: scripts/ops/sweep-webhook-retries.ts
sha256: a532627f987b0147ff1386d7c555989de486b2dd6072be7cfda4e9329ef26717
generated_at: 2026-09-23T17:30:51.437358+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-webhook-retries.ts

## Purpose

Per-minute cron job that re-enqueues webhook deliveries whose retry window has arrived. Implements decision (c) of the delayed-retry design: a failed attempt with remaining retries is set back to `pending` with a future `nextAttemptAt` instead of being parked in a broker delay queue, and this sweep is what picks up those "due" rows and publishes them again.

## Key elements

- **`main`** – Calls `start()` (DB connection) then `sweepDueWebhookDeliveries()`; resolves `void`.
- **`runScript(main, stopDatabase)`** – Bootstrap wrapper (from `../db/run-script`) that runs `main` and guarantees `stopDatabase` on exit.
- **`sweepDueWebhookDeliveries`** (imported from `@modules/webhooks`) – Atomically claims each due row before publishing, so overlapping runs cannot double-enqueue.

## Relationships

- **`scripts/db/run-script.ts`** – Provides the `runScript` helper that orchestrates the script's lifecycle (setup → run → teardown).
- **`src/infrastructure/runtime/database.ts`** – Supplies `start()` to open the DB connection and `stopDatabase` for clean shutdown.
- **`src/modules/webhooks/index.ts`** – Re-exports `sweepDueWebhookDeliveries`, the function this script calls.
- **`src/modules/webhooks/services/sweep.ts`** – Contains the actual implementation of `sweepDueWebhookDeliveries` (atomic claim + publish).

## Notes

- Scheduled **every minute** (unlike the nightly `reap:*` / `sweep:order-effects` jobs). The schedule is in `docker/crontab`.
- **Idempotent by design**: the atomic claim in the sweep service means a missed or overlapping run is a no-op, not a bug.
- **No domain event** is emitted here (contrast with `sweep-order-effects.ts`), so no module listener registration is required.
- **Removal** is coupled to the `webhooks` module: deleting that module also removes this script, the `sweep:webhook-retries` npm alias, and its crontab entry.
- Lives in the shared **cron container** alongside other scheduled jobs (see `docs/reference/ops.md#scheduled-jobs`).
