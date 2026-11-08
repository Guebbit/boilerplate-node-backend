---
source: src/modules/webhooks/services/enqueue.ts
sha256: e54b0a087d643bbaa1dcb9117d88890f6d34323de43c58493bbf67f8fb006186
generated_at: 2026-11-08T09:06:23.859298+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/enqueue.ts

## Purpose

Single shared helper that publishes a delivery row's next attempt onto the worker queue. It exists so that both the fast-path publisher (`publish.ts`) and the retry sweep (`sweep.ts`) use one identical enqueue call rather than duplicating the payload shape and channel selection. Implements the Claim Check EIP: the message carries only the row's `deliveryId`; the row itself remains the source of truth for attempt details.

## Key elements

- **`enqueueDeliveryAttempt(delivery: WebhookDeliveryDocument): Promise<boolean>`** — The sole export. Builds a `WebhookDeliverJobPayload` containing just the stringified row id, then calls `publishToQueue` against `WORKER_CHANNELS.WEBHOOK_DELIVER`. Returns `true` if the broker accepted the message, `false` if it was refused or no broker was available (the signal `sweep.ts` uses to fall back to processing the row inline).

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — Provides `publishToQueue`, the generic broker publish call that this function delegates to.
- **`src/modules/webhooks/model.ts`** — Supplies the `WebhookDeliveryDocument` type used as the function's input.
- **`src/modules/webhooks/services/publish.ts`** — Calls `enqueueDeliveryAttempt` immediately after a delivery row is created (fast path).
- **`src/modules/webhooks/services/sweep.ts`** — Calls `enqueueDeliveryAttempt` for rows that are due for retry; inspects the `false` return to decide whether to process the row directly.
- **`src/types/index.ts`** — Exports `WORKER_CHANNELS.WEBHOOK_DELIVER` (the target channel) and the `WebhookDeliverJobPayload` shape.

## Notes

- Publishing the same row twice is intentionally safe: the actual claim (and the one real HTTP attempt) is performed later by the worker's `attempt.ts`, not here. This file never claims.
- The `false` return is not an error; it is a protocol signal for `sweep.ts` to pick up the row itself rather than relying on a broker.
- The payload is deliberately minimal (id only). Do not enrich it with row fields — that would break the Claim Check invariant documented in the module docblock and `asyncapi.internal.yaml`.
