---
source: src/modules/webhooks/services/enqueue.ts
sha256: 5ee3bb4949708acd08a7423f3369cea3d93a2d2786deaa736f94a6a8cc78bfcb
generated_at: 2026-09-27T15:44:03.861444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/enqueue.ts

## Purpose
Single shared function that publishes a delivery-row's next attempt onto the worker queue. Both the fast path (`publish.ts`, right after a row is created) and the retry sweep (`sweep.ts`, for a row already due) call this same helper. It implements the **Claim Check** pattern: the message carries only the delivery row's `_id`, because the row itself is the source of truth for everything an attempt needs.

## Key elements
- **`enqueueDeliveryAttempt(delivery: WebhookDeliveryDocument): Promise<void>`** — The sole export. Builds a `WebhookDeliverJobPayload` containing only `deliveryId`, then calls `publishToQueue` on the `WORKER_CHANNELS.WEBHOOK_DELIVER` channel. Returns a resolved `void` promise (discards any value the adapter might resolve with).
- **Not a claim** — Publishing the same row twice is explicitly safe; the worker-side `attempt.ts` is what performs the exclusive claim and the actual HTTP call.

## Relationships
- **`src/infrastructure/adapters/queue.ts`** — Imports `publishToQueue`, the thin wrapper over the underlying queue broker.
- **`src/types/index.ts`** — Imports `WORKER_CHANNELS` (route key) and the `WebhookDeliverJobPayload` type.
- **`src/modules/webhooks/model.ts`** — Imports the `WebhookDeliveryDocument` type used as the function's input parameter.
- **`src/modules/webhooks/services/publish.ts`** — Caller on the fast path (immediately after a new delivery row is written).
- **`src/modules/webhooks/services/sweep.ts`** — Caller on the retry path (picks up rows that are already due).

## Notes
- The function is intentionally side-effect-light: it only enqueues. No status change, no claim, no retry counter increment happens here.
- Because it never claims, there is no risk of "double-enqueue" causing a double-attempt; the worker's own claim (`./attempt.ts`) is the single gate.
- The module docblock references `../asyncapi.internal.yaml` as the canonical schema description for the queue message contract.
