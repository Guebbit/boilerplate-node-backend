---
source: src/modules/webhooks/services/publish.ts
sha256: 48b82e0b9d618ab54ac2a9a51a918b203db6a61f72720109fbfe21e5f68f3bc5
generated_at: 2026-09-23T19:42:50.238321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/publish.ts

## Purpose

Domain-event subscriber for the webhooks module. It registers listeners on the kernel's event bus for order and payment events, matches each incoming event against every enabled webhook subscription's filter, and fans out by writing a `pending` delivery row and enqueuing a fast-path delivery attempt per match. It is the sole bridge that lets the webhooks module react to order/payment activity without importing those modules directly (the dependency direction is domain-event-only, as prescribed by the module boundary rules).

## Key elements

- **`subscribeToWebhookEvents()`** *(exported)* — Registers five `onDomainEvent` listeners covering six public events. Called once from `module.ts`'s `subscribe()` hook.
- **`fanOut(event)`** *(internal)* — Generates a single `randomUUID()` as `eventId`, loads all enabled subscriptions, filters via `matchesEventFilter`, and calls `deliverToOne` for each match in parallel.
- **`deliverToOne(subscription, event, eventId)`** *(internal)* — Writes a delivery row, then enqueues the attempt. Catches errors per subscription so one failure doesn't block siblings.
- **`createDeliveryRow(...)`** *(internal)* — Persists a new `WebhookDeliveryDocument` with `status: 'pending'`, `attempt: 1`, `nextAttemptAt: now`.
- **`enqueueAttempt(delivery)`** *(internal)* — Publishes a `WebhookDeliverJobPayload` (carrying only `deliveryId`) to the `WEBHOOK_DELIVER` queue channel. Fire-and-forget by design.
- **`PublicEvent`** *(interface)* — `{ eventType: string; data: Record<string, unknown> }`; the normalized shape passed into `fanOut`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Imports `onDomainEvent` to register listeners on the kernel bus. |
| `src/modules/orders/index.ts` | Imports `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED` event constants. |
| `src/modules/payments/index.ts` | Imports `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED` event constants. |
| `src/modules/webhooks/repository.ts` | Calls `webhookSubscriptionRepository.findEnabled()` and `webhookDeliveryRepository.create()`. |
| `src/modules/webhooks/domain/index.ts` | Imports `matchesEventFilter` for subscription matching. |
| `src/modules/webhooks/model.ts` | Uses `WebhookDeliveryDocument` and `WebhookSubscriptionDocument` types. |
| `src/infrastructure/adapters/queue.ts` | Calls `publishToQueue` to enqueue delivery attempts. |
| `src/infrastructure/adapters/logger.ts` | Logs an error when a per-subscription fan-out fails. |
| `src/types/index.ts` | Imports `WORKER_CHANNELS.WEBHOOK_DELIVER` and `WebhookDeliverJobPayload`. |
| `src/modules/webhooks/module.ts` | Calls `subscribeToWebhookEvents()` from its `subscribe()` lifecycle hook. |
| `src/modules/webhooks/services/index.ts` | Re-exports this module's public surface. |
| `tests/unit/infrastructure/adapters/queue.test.ts` | Exercises the `publishToQueue` adapter this file depends on. |

## Notes

- **Fire-and-forget enqueue:** If `publishToQueue` throws (no broker, transient error), the delivery row already written remains `pending`. Recovery relies on `scripts/ops/sweep-webhook-retries.ts` — the row is never lost, at worst delayed to the sweep interval.
- **Shared `eventId`:** One UUID is generated per incoming event and reused across all subscription matches. Consumers deduplicate on this value (Standard Webhooks `webhook-id`), covering both retries of one delivery and fan-out to multiple subscriptions.
- **Claim Check pattern:** The queue message carries only `deliveryId`, not the payload. The delivery row is the source of truth; the worker re-reads it at attempt time.
- **`order.paid` / `order.shipped` derivation:** Both are produced by filtering the single `ORDER_STATUS_CHANGED` event on the `to` field. The event payload does not carry semantic meaning about *which* transition; listeners decide.
- **Per-subscription isolation:** `deliverToOne` catches its own errors, mirroring the per-handler catch in `emitDomainEvent`. A Stryker `disable all` comment guards the catch block.
- **`attempt` is always 1 here:** Subsequent retries (attempt 2, 3, …) are driven by the sweep/worker, not by this module.
