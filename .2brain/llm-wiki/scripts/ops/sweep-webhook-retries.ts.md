---
source: scripts/ops/sweep-webhook-retries.ts
sha256: b52be68a7b1a338f5e4cdf784b2923bbe3ee2315e68c3f4e81e3635bcd4b198c
generated_at: 2026-10-01T12:37:12.711294+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-webhook-retries.ts

## Purpose

A per-minute cron script that turns webhook deliveries whose `nextAttemptAt` has passed back into active delivery attempts. It exists because the retry design (decision (c) in `docs/modules/webhooks.md`) uses a database timestamp rather than a broker delay queue, so something must periodically "wake" due rows.

## Key elements

- **`main`** — thin async function: starts the database connection, then calls `sweepDueWebhookDeliveries()`. No further cleanup; `runScript` handles teardown.
- **`runScript('sweep:webhook-retries', main, stopDatabase)`** — entry-point wrapper (from `scripts/run-script.ts`) that registers the shutdown hook.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` helper that wires up CLI lifecycle (error handling, signal cleanup, `stopDatabase` on exit).
- **`src/infrastructure/runtime/database.ts`** — supplies `start()` to open a pool and `stopDatabase` as the registered shutdown callback.
- **`src/modules/webhooks/index.ts`** — re-exports `sweepDueWebhookDeliveries`; this script is the only caller for the scheduled-retry path.
- **`src/modules/webhooks/services/sweep.ts`** — contains the actual `sweepDueWebhookDeliveries` implementation (claim-and-publish-or-send logic).

## Notes

- Runs **every minute** (per-minute cron container, unlike nightly `reap:*` / `sweep:order-effects` jobs). Idempotent by design: the per-row claim means an overlapping run simply lets one HTTP attempt through; a missed run costs nothing because the next tick picks the row up.
- Unlike `sweep-order-effects.ts`, **no domain event is emitted**, so there is no listener/module-registration step.
- Removal is owned by the `webhooks` module: delete the script, the `sweep:webhook-retries` npm script entry, and the corresponding `docker/crontab` line together.
