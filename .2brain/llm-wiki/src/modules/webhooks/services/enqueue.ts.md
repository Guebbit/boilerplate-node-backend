---
source: src/modules/webhooks/services/enqueue.ts
sha256: e54b0a087d643bbaa1dcb9117d88890f6d34323de43c58493bbf67f8fb006186
generated_at: 2026-10-15T12:21:29.407597+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/enqueue.ts

## Purpose

Single-point enqueue helper for webhook delivery attempts. Both the fast path (`publish.ts`, right after a delivery row is created) and the retry sweep (`sweep.ts`, for rows already due) call this instead of touching the queue adapter directly. It implements the **Claim Check** EIP: the queue message carries only the delivery row's `_id`, treating the row in the database as the source of truth for everything an attempt needs.

## Key elements

- **`enqueueDeliveryAttempt(delivery: WebhookDeliveryDocument): Promise<boolean>`** — Sole export. Builds a `WebhookDeliverJobPayload` (`{ deliveryId }`) and publishes it to `WORKER_CHANNELS.WEBHOOK_DELIVER` via `publishToQueue`. Returns `true` if the broker accepted the message, `false` if it was refused or unavailable.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — Provides `publishToQueue`, the generic broker publish used here.
- **`src/modules/webhooks/model.ts`** — Supplies the `WebhookDeliveryDocument` type for the function parameter.
- **`src/modules/webhooks/services/publish.ts`** — Calls `enqueueDeliveryAttempt` on the fast path immediately after creating a delivery row.
- **`src/modules/webhooks/services/sweep.ts`** — Calls `enqueueDeliveryAttempt` for each due row; uses the `false` return value as a cue to fall back to in-process handling.
- **`src/types/index.ts`** — Source of the `WORKER_CHANNELS.WEBHOOK_DELIVER` channel name and the `WebhookDeliverJobPayload` payload type.

## Notes

- **Never claims.** Publishing the same row's ID twice is safe; the worker's own claim (in `attempt.ts`) is what arbitricates who performs the single real HTTP call. Do not add claim logic here.
- **`false` return is a signal, not an error.** It means "nobody will consume this message," which `sweep.ts` specifically checks to decide whether to process the row itself.
- The message schema is documented in `../asyncapi.internal.yaml`; keep the payload shape in sync with that spec.
