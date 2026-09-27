---
source: scripts/ops/sweep-webhook-retries.ts
sha256: 1183edbe2bdd496c34354ef20fdb1807111305f16985972c1dda5eff5732f5b3
generated_at: 2026-09-27T13:58:56.035534+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-webhook-retries.ts

## Purpose

Per-minute cron job that enqueues all webhook deliveries whose `nextAttemptAt` has passed, turning them from "pending with a future timestamp" into active retry attempts. It exists because the delayed-retry strategy (decision (c) in `docs/modules/webhooks.md`) stores retries as a database timestamp rather than a broker-side delay queue, so something must periodically pick up due rows.

## Key elements

- **`main`** (internal) — calls `start()` to open the DB connection, then `sweepDueWebhookDeliveries()`; returns `Promise<void>`.
- **`runScript('sweep:webhook-retries', main, stopDatabase)`** — the single entry-point invocation; registers the script name, wires `stopDatabase` as the teardown, and handles process lifecycle (signal trapping, error reporting).
- **`sweepDueWebhookDeliveries`** (imported from `@modules/webhooks`) — the actual sweep logic; atomically claims each due row before publishing so overlapping runs cannot double-enqueue.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` helper that wraps `main` with signal handling, a human-readable script label, and the `stopDatabase` teardown callback.
- **`src/infrastructure/runtime/database.ts`** — supplies `start` (opens the connection) and `stopDatabase` (closes it); the script does not use the connection directly beyond handing it to the sweep function.
- **`src/modules/webhooks/index.ts`** — re-exports `sweepDueWebhookDeliveries`, the one function this script actually calls.
- **`src/modules/webhooks/services/sweep.ts`** — implements `sweepDueWebhookDeliveries` (atomic claim-then-publish per due row).
- **`docker/observability/prometheus.alert-rules.yaml`** — no direct code interaction; listed in the dependency graph likely because this script's failure/success metrics are what those alert rules monitor.

## Notes

- Runs every minute inside the shared cron container (see `docs/reference/ops.md#scheduled-jobs`), unlike the nightly `reap:*` / `sweep:order-effects` jobs.
- Idempotent by design: the atomic claim in `sweepDueWebhookDeliveries` means a missed or overlapping run is a no-op, not a duplicate.
- Emits **no** domain event (contrast with `sweep-order-effects.ts`), so there is no listener registration step for other modules.
- Removal is owned by the `webhooks` module: delete this file, the `sweep:webhook-retries` npm script, and its `docker/crontab` line together.
