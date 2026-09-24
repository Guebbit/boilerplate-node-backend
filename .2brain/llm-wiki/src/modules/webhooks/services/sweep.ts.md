---
source: src/modules/webhooks/services/sweep.ts
sha256: 47cca1f97c339027cca19c00f772717da6dc10c0bf835f88e8465037a0ab1592
generated_at: 2026-09-23T19:43:19.587795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/sweep.ts

## Purpose

Implements the webhook retry sweep: finds every delivery row that is due for another attempt (including stranded `in-flight` rows whose lease has expired) and publishes a job to the worker queue. It deliberately does **not** claim the row — idempotency is guaranteed downstream by the worker's lease/claim in `attempt.ts`. The per-minute ops script calls this to keep retries moving without waiting for the nightly `reap:*` jobs.

## Key elements

- **`sweepDueWebhookDeliveries()`** (exported) — Queries `webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT)` and fan-outs an `enqueue` call per due row. Returns a resolved promise on success.
- **`enqueue(delivery)`** (internal) — Publishes a `WebhookDeliverJobPayload` (containing only the delivery `_id`) to the `WORKER_CHANNELS.WEBHOOK_DELIVER` queue via `publishToQueue`.
- **`SWEEP_BATCH_LIMIT`** (constant, 200) — Caps the number of rows a single sweep run can publish, preventing an unbounded burst if the sweep runs very late.

## Relationships

- **`scripts/ops/sweep-webhook-retries.ts`** — The scheduled caller; invokes `sweepDueWebhookDeliveries` on a per-minute cadence.
- **`src/modules/webhooks/repository.ts`** — Supplies `webhookDeliveryRepository.findDue()`, which returns rows due for retry or with an expired in-flight lease.
- **`src/infrastructure/adapters/queue.ts`** — Provides `publishToQueue`, the transport used by `enqueue`.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance for the single info log per sweep.
- **`src/types/index.ts`** — Exports `WORKER_CHANNELS` (queue name) and the `WebhookDeliverJobPayload` type.
- **`src/modules/webhooks/model.ts`** — Exports the `WebhookDeliveryDocument` type used as the parameter of `enqueue`.
- **`src/modules/webhooks/services/index.ts`** — Re-exports `sweepDueWebhookDeliveries` as part of the webhooks service API.
- **`src/modules/webhooks/tests/integration/sweep.test.ts`** — Integration test covering sweep behavior.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests for the queue adapter this file depends on.

## Notes

- **Publish-without-claim design:** A row may be published more than once (overlapping sweeps, fast-path race). This is safe because `attempt.ts` performs the actual claim; duplicate messages are acked as no-ops.
- **Payload is intentionally minimal:** Only `deliveryId` is sent. Stamping `attempt` or `eventType` in the message would go stale on a replay; the worker reads the row's own `attempt` from the DB.
- **`Stryker disable` annotation** on the `logger.info` line suppresses mutation testing for that statement — it is a deliberate choice, not an oversight.
- This sweep runs **per-minute**, not nightly; do not confuse it with the `reap:*` cron jobs mentioned in the docblock.
