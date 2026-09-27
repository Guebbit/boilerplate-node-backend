---
source: src/modules/webhooks/services/sweep.ts
sha256: 69eec9034dc0a3e16600c6c8c1c34ee9ecea7c0de048cc837cef18b457a4bc68
generated_at: 2026-09-27T15:44:59.960385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/sweep.ts

## Purpose
Implements the periodic retry sweep for webhook deliveries: it finds every delivery row that is due for another attempt (including stranded `in-flight` rows whose lease has expired) and enqueues them for processing. It deliberately publishes *without* claiming a lease, so overlapping or duplicate sweeps are safe—only the worker in `attempt.ts` claims and performs the actual HTTP call.

## Key elements
- **`SWEEP_BATCH_LIMIT` (200)** – Caps how many rows a single sweep run can enqueue, preventing an unbounded burst if the sweep runs very late.
- **`sweepDueWebhookDeliveries()`** (exported) – Queries `webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT)` and maps each result through `enqueueDeliveryAttempt`. Returns `Promise<void>`. Idempotent by design: a double-publish wastes one queue message but never causes a duplicate delivery.

## Relationships
- **`scripts/ops/sweep-webhook-retries.ts`** – Calls `sweepDueWebhookDeliveries` on a per-minute schedule (distinct from the nightly `reap:*` jobs).
- **`src/modules/webhooks/repository.ts`** – Provides `webhookDeliveryRepository.findDue`, which returns due/stranded rows.
- **`src/modules/webhooks/services/enqueue.ts`** – Provides `enqueueDeliveryAttempt`, the per-row enqueue call used here.
- **`src/infrastructure/adapters/logger.ts`** – Supplies the `logger` used to log each sweep run's count.
- **`src/modules/webhooks/services/index.ts`** – Barrel re-export; external consumers import `sweepDueWebhookDeliveries` through the services index rather than this file directly.
- **`src/modules/webhooks/tests/integration/sweep.test.ts`** – Integration tests exercising the sweep flow end-to-end.

## Notes
- This function never acquires a lease. The claim (and the one real HTTP attempt) happens later in `attempt.ts#processDeliveryJob`. If two sweeps or a fast-path republish race, the first claim wins and the rest ack as no-ops.
- The `Stryker disable next-line all` comment on the logger call suppresses mutation testing for that single line (a pure log statement with no branch to mutate).
- The sweep is *not* the nightly reaper; it runs every minute via the ops script, targeting rows whose retry backoff has elapsed or whose lease has lapsed.
