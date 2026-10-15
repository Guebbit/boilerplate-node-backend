---
source: src/modules/webhooks/services/sweep.ts
sha256: 83dd3cc634035e0e65b0bc74f0b5e34d277fe80d91994763c189741f93c2dc51
generated_at: 2026-10-15T12:22:39.896204+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/sweep.ts

## Purpose

Implements the webhook delivery retry sweep: finds every delivery row that is due for another attempt (including stranded `in-flight` rows whose lease expired) and dispatches them—either by publishing to a message broker or by sending inline when no broker is available. It exists as the "degrade, don't drop" fallback so that no delivery is lost when the broker is down, and it runs outside the request path so a slow subscriber never blocks the API.

## Key elements

- **`SWEEP_BATCH_LIMIT`** (200) — upper bound on rows a single sweep run processes, preventing an unbounded batch if the sweep runs very late.
- **`INLINE_CONCURRENCY`** (5) — group size for inline sends; matches the queue consumer's `prefetch` so serial hard-timeouts don't stack past the sweep's one-minute window.
- **`publishOrSend`** *(private)* — Tries `enqueueDeliveryAttempt`; if the broker accepts the message the work is done, otherwise falls through to `processDeliveryJob` for an inline claim-and-send.
- **`handleInGroups`** *(private, recursive)* — Processes a list of due rows in chunks of `INLINE_CONCURRENCY` via `Promise.allSettled`, logs a summary if any chunk has failures, then recurses on the remainder. Failed rows are left for the next sweep (their lease-based claim expires naturally).
- **`sweepDueWebhookDeliveries`** *(exported)* — The single public entry point. Calls `webhookDeliveryRepository.findDue(SWEEP_BATCH_LIMIT)`, logs the count, and delegates to `handleInGroups`.

## Relationships

- **`scripts/ops/sweep-webhook-retries.ts`** — Scheduled caller; invokes `sweepDueWebhookDeliveries` per-minute (distinct from the nightly `reap:*` jobs).
- **`src/modules/webhooks/repository.ts`** — Provides `findDue(limit)`, which returns rows due for retry plus stranded in-flight leases.
- **`src/modules/webhooks/services/enqueue.ts`** — `enqueueDeliveryAttempt` is the broker-publish path; its return value determines whether inline fallback is needed.
- **`src/modules/webhooks/services/attempt.ts`** — `processDeliveryJob` is the inline claim-and-send path (same lease/claim logic a broker worker would execute).
- **`src/modules/webhooks/model.ts`** — Supplies the `WebhookDeliveryDocument` type used throughout.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging for sweep start and per-chunk failure summaries.
- **`src/modules/webhooks/services/index.ts`** — Barrel re-export (consumers import `sweepDueWebhookDeliveries` from here).
- **`src/modules/webhooks/tests/integration/sweep.test.ts`** — Integration tests for the sweep behavior.

## Notes

- **Idempotent by design:** If the same row is published twice (overlapping sweep runs, or a fast-path race), only the first successful lease-claim performs the actual HTTP attempt; all subsequent claims find the row already under a live lease.
- **Runs outside the request:** The sweep deliberately performs I/O in its own context so a dead endpoint's timeout never propagates into an API response.
- **Stryker mutation-testing annotation:** The `logger.info` line carries `// Stryker disable next-line all` to suppress mutation coverage on a pure log call.
