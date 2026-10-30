---
source: src/modules/webhooks/services/sweep.ts
sha256: 64d32e4ee70330515f557ca9b842da42675cd7c250476b127af59b9c9a1dd3ce
generated_at: 2026-10-29T06:31:03.339716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/sweep.ts

## Purpose

Implements the periodic retry sweep for webhook deliveries. On each scheduled run it finds every delivery due for another attempt (including stranded `in-flight` rows whose lease has expired) and dispatches them — either via a message broker or inline through the same `processDeliveryJob` path a worker would use. It exists so that a failed or missed delivery is retried automatically without depending on the originating request or an external worker.

## Key elements

- **`sweepDueWebhookDeliveries`** (exported) — entry point. Calls `webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT)`, logs the batch size, then delegates to `handleInGroups`.
- **`handleInGroups`** (internal) — processes rows in batches of `INLINE_CONCURRENCY` (5) using `Promise.allSettled`, recursing over the remainder. Failed rows are logged and left for the next sweep (their lease-based claim expires naturally).
- **`publishOrSend`** (internal) — attempts broker publish via `enqueueDeliveryAttempt`; if the broker is unavailable or refuses the message, falls back to an inline `processDeliveryJob` call.
- **`SWEEP_BATCH_LIMIT`** (200) — caps a single sweep run so a very late sweep cannot burst an unbounded batch.
- **`INLINE_CONCURRENCY`** (5) — inline concurrency ceiling, matched to the consumer's `prefetch` so a dead endpoint's timeout does not stack past the sweep's one-minute window.

## Relationships

- **`src/modules/webhooks/repository.ts`** — calls `findDue(limit)` to fetch due and stranded rows; the lease design here makes double-publishing safe.
- **`src/modules/webhooks/services/enqueue.ts`** — calls `enqueueDeliveryAttempt` to attempt broker publish before falling back to inline.
- **`src/modules/webhooks/services/attempt.ts`** — calls `processDeliveryJob` for the inline-send path (same claim → lease → HTTP attempt a worker would perform).
- **`src/modules/webhooks/model.ts`** — imports the `WebhookDeliveryDocument` type used throughout.
- **`src/infrastructure/adapters/logger.ts`** — logs sweep start (info) and per-group failures (error).
- **`src/modules/webhooks/jobs.ts`** — the `sweep:webhook-retries` script (per-minute schedule) invokes this function; distinct from the nightly `reap:*` jobs.
- **`src/modules/webhooks/services/index.ts`** — barrel re-export of `sweepDueWebhookDeliveries`.
- **`src/modules/webhooks/tests/integration/sweep.test.ts`** — integration tests for this module.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — unit tests for the queue adapter that `enqueueDeliveryAttempt` relies on.

## Notes

- **Degrade, don't drop.** The broker-publish → inline-send fallback ensures a row is never silently lost if the broker is down; the cost is that the sweep process itself does I/O.
- **Idempotency via lease.** A row published twice (overlapping sweeps, or a fast-path race) results in at most one real HTTP attempt: whichever `processDeliveryJob` call claims the lease first wins; subsequent claims are no-ops.
- **Recursion, not a loop.** `handleInGroups` is tail-recursive over `INLINE_CONCURRENCY`-sized slices rather than a `for` loop. With `SWEEP_BATCH_LIMIT = 200` and concurrency 5, that is at most 4 recursive frames.
- **Stryker mutation-testing suppression** is applied to the `logger.info` line (mutation would have no behavioral effect).
