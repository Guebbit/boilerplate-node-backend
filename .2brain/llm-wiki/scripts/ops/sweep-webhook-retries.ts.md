---
source: scripts/ops/sweep-webhook-retries.ts
sha256: a4c825eeb9387f82462d71a8b982ddbda883c11407a3213aef035b7a0f6d1e1b
generated_at: 2026-10-14T07:29:00.674939+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/sweep-webhook-retries.ts

## Purpose

Cron entry-point (npm script `sweep:webhook-retries`) that runs every minute to find webhook delivery rows whose `nextAttemptAt` has passed and re-dispatches them—either by publishing to a broker or by sending the HTTP attempt inline when no broker is configured. It exists because the delayed-retry strategy (decision c in the webhooks module docs) parks failed attempts back in `pending` with a future timestamp rather than using a broker delay queue, so something must periodically pull due rows back into the delivery path.

## Key elements

- **`main`** – async function; calls `startJob()` (DB connection) then `sweepDueWebhookDeliveries()`. Resolves void; no return value is consumed.
- **`runScript('sweep:webhook-retries', main, stopDatabase)`** – wraps `main` with the shared script lifecycle: records outcome under the `sweep:webhook-retries` key for `/observability/health`, and calls `stopDatabase` on both success and failure paths.
- **Import ordering** – `@infrastructure/config/dotenv` and `@infrastructure/runtime/mongoose-boot` are imported before any model-bearing module so Mongoose schema defaults are set at build time.

## Relationships

- **`scripts/run-script.ts`** – provides the `runScript` wrapper that owns process exit, health recording, and teardown.
- **`src/infrastructure/runtime/database.ts`** – supplies `startJob` (connection) and `stopDatabase` (teardown) used by `runScript`.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – must load before any schema/model import; sets Mongoose connection defaults.
- **`src/infrastructure/config/dotenv.ts`** – loads environment variables before anything else.
- **`src/modules/webhooks/index.ts`** – re-exports `sweepDueWebhookDeliveries`, the single function this script calls.
- **`src/modules/webhooks/services/sweep.ts`** – implements the actual claim-and-publish (or claim-and-send) logic for each due delivery row.
- **`docker/observability/prometheus.alert-rules.yaml`** – the `sweep:webhook-retries` job name is the key under which `runScript` records health; alert rules can key off that metric.

## Notes

- **Idempotent & overlap-safe.** A second run starting before the first finishes is harmless: the per-row claim guarantees only one HTTP attempt goes through.
- **No domain event.** Unlike `sweep-order-effects.ts`, this script emits no domain event and therefore registers no module listeners.
- **Removal contract.** Deleting this file also requires removing the `sweep:webhook-retries` npm script and its `docker/crontab` entry; the script is owned by the `webhooks` module.
- **Frequency differs from `reap:*` jobs.** This sweeps every minute; nightly `reap` jobs run on a much longer cadence. Do not assume shared scheduling semantics.
