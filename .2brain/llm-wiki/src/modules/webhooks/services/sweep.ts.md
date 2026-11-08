---
source: src/modules/webhooks/services/sweep.ts
sha256: fb79cfb66154d2dbe9361da2fbf8f1481123eb9391c66fd312d78742909925cc
generated_at: 2026-11-08T09:07:31.337510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/sweep.ts

## Purpose

Per-minute retry sweep for webhook deliveries. It fetches every delivery due for another attempt plus any stranded `in_flight` row whose lease has expired, then dispatches each one — either by publishing to the broker or by sending inline when no broker is available. This is the "degrade, don't drop" fallback that keeps deliveries moving without tying them to an API request.

## Key elements

- **`SWEEP_BATCH_LIMIT`** (200) — hard cap on rows a single sweep run processes, preventing an unbounded burst if a sweep is very late.
- **`INLINE_CONCURRENCY`** (5) — group size for inline sends; matches the consumer's `prefetch` so a dead endpoint's timeout doesn't stack serially past the one-minute window.
- **`publishOrSend(delivery)`** — attempts `enqueueDeliveryAttempt`; if the broker refuses, falls back to `processDeliveryJob` inline.
- **`handleInGroups(rows)`** — processes rows in groups of `INLINE_CONCURRENCY` via `Promise.allSettled`, logging failures and recursing on the remainder. Failed rows are left for the next sweep (their lease-based claim expires naturally).
- **`sweepDueWebhookDeliveries()`** *(exported)* — entry point called by the `sweep:webhook-retries` schedule. Calls `repository.findDue`, then `handleInGroups`.

## Relationships

- **`repository.ts`** — calls `findDue(limit)` to fetch due and stranded rows. The lease design there is what makes this sweep idempotent: a second delivery of the same message finds the row already under a live lease and no-ops.
- **`attempt.ts`** — imports `processDeliveryJob` for the inline (no-broker) send path. The sweep and a real worker both funnel through the same claim → single-HTTP-attempt logic.
- **`enqueue.ts`** — imports `enqueueDeliveryAttempt` for the broker-publish path.
- **`model.ts`** — uses `WebhookDeliveryDocument` as the row type throughout.
- **`logger.ts`** — logs an `info` at sweep start and an `error` when inline sends in a group fail.
- **`jobs.ts`** — the `sweep:webhook-retries` cron (per-minute) is what invokes `sweepDueWebhookDeliveries`, as distinct from the nightly `reap:*` jobs.
- **`tests/integration/sweep.test.ts`** — integration tests covering the sweep's behavior.

## Notes

- Idempotency is guaranteed by the lease, not by the sweep itself. Overlapping sweep runs or a fast-path race that republishes a stranded row are safe: whichever claim lands first performs the one real HTTP attempt; all others no-op.
- `handleInGroups` is recursive (not a loop). With `SWEEP_BATCH_LIMIT` = 200 and `INLINE_CONCURRENCY` = 5, that's at most 40 sequential groups — bounded, but worth knowing if you're tracing a long tail.
- The Stryker mutation-testing suppression on the `logger.info` line means that log statement is excluded from mutation coverage; don't assume it's load-bearing.
- This file deliberately keeps sending out of the request path so a slow subscriber never slows the API.
