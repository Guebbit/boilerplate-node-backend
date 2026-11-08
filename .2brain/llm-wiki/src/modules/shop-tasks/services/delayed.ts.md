---
source: src/modules/shop-tasks/services/delayed.ts
sha256: 3dc22d13c4463e1070fe41546800b10b085c6630f4a1a6338e149c6dafb40a2f
generated_at: 2026-11-08T08:16:10.797009+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/delayed.ts

## Purpose

Event handler for the `fulfillment_order.delayed` domain event. It combines two side effects—opening a consent-reminder to-do and writing a buyer notice—into a single handler, running the to-do first. The file exists so that one module maps to one event handler per the project's event-dispatch convention.

## Key elements

- **`onFulfillmentOrderDelayed(payload, meta)`** – The sole export. Accepts the typed `fulfillment_order.delayed` payload and event metadata, then chains:
  1. `shopTasks.onDelayed(payload, meta)` – opens the consent reminder (idempotent by `eventId`).
  2. `shopNotices.onFulfillmentOrderDelayedNotice(payload)` – writes the buyer-facing notice.
  Returns a `Promise<void>` that resolves after both steps complete.

## Relationships

- **`src/kernel/events.ts`** – Supplies the `DomainEventMap` and `DomainEventMeta` types used in the handler's signature.
- **`src/modules/shop-tasks/services/tasks.ts`** – Provides `shopTasks.onDelayed`, the first step of the handler chain (consent to-do).
- **`src/modules/shop-tasks/services/notices.ts`** – Provides `shopNotices.onFulfillmentOrderDelayedNotice`, the second step (buyer notice).
- **`src/modules/shop-tasks/services/index.ts`** – Re-exports this handler so the event-dispatch layer can register it.

## Notes

- The to-do step is idempotent by `eventId`, so if the notice step fails and the event is redelivered, `onDelayed` is a no-op and only the notice is (re)written. This is the intended recovery path—do not add separate retry logic around the notice call.
- Ordering is fixed: to-do before notice. Reordering would break the "redelivery = no-op open + one notice" guarantee.
