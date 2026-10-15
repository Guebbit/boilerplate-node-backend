---
source: src/modules/orders/events.ts
sha256: fd10d6d423b091d1a9ba6e2baa4e6342e2085c19d365a74dc788cee04d652b8e
generated_at: 2026-10-15T11:04:07.158601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Declares the domain-event payload types that the orders module emits and exports the corresponding string-name constants. It augments the kernel's `DomainEventMap` (via `declare module '@kernel/events'`) so each module grows the event catalogue without editing a central file. Because `orders` sits low in the dependency graph—payments and delivery depend on it, never the reverse—emitting these events is the only way the module communicates outward.

## Key elements

- **`DomainEventMap` augmentation** – Adds five payload types:
  - `order.cancelled` – `{ orderId, refund }`. `refund` encodes the policy (customer vs. operator cancellation) so listeners don't infer it.
  - `order.refund_owed` – `{ orderId }`. Internal-only retry-nudge for `payments`; split from `order.cancelled` so a retry sweep doesn't re-fire the customer-facing webhook.
  - `order.status_changed` – `{ orderId, from, to }`. Fires for *any* status move (system or admin override); listeners filter on `to`.
  - `order.created` – `{ orderId }`. Emitted exactly once by `placeOrder`; the `webhooks` listener uses it.
  - `order.status_overridden` – `{ orderId, from, to, at, mode }`. Internal-only; lets `delivery` align fulfillment/shipments with a manual forward.
- **Exported constants** – `ORDER_CANCELLED`, `ORDER_REFUND_OWED`, `ORDER_STATUS_CHANGED`, `ORDER_CREATED`, `ORDER_STATUS_OVERRIDDEN`. Single-source spelling so emitters and listeners share one literal instead of duplicating strings.

## Relationships

- **`src/types/index.ts`** – Supplies the `OrderStatus` type used in `order.status_changed` and `order.status_overridden` payloads.
- **`src/modules/orders/services/announce.ts`** – Writes `order.status_changed` to the transactional outbox inside the status-write transaction.
- **`src/modules/orders/services/cancel.ts`** – Writes `order.cancelled` to the outbox in the cancel's own transaction (at-most-once write, at-least-once delivery).
- **`src/modules/orders/services/status.ts`** – Participates in status transitions that produce `order.status_changed`.
- **`asyncapi.public.yaml`** – Defines the public AsyncAPI channels for externally visible events (`order.cancelled`, `order.status_changed`, `order.created`); `order.refund_owed` and `order.status_overridden` are internal-only and have no channel.
- **`src/modules/orders/index.ts` / `module.ts`** – Re-export or register the events/constants for consumption by other modules.
- **Integration tests** (`cancel`, `outbox`, `pending-effects`, `service-override`, `service-status`) – Verify the outbox-write and delivery guarantees documented in the type-level comments.

## Notes

- **Delivery semantics are split by concern:** the outbox write is at-most-once (guarded by a `$in` check on the order ID); the relay delivers at-least-once. Listeners must dedupe on `meta.eventId`.
- **Internal vs. public events:** `order.refund_owed` and `order.status_overridden` are deliberately excluded from the AsyncAPI spec—nothing outside this application needs them.
- **No runtime logic:** the file contains only type declarations and `const` string exports. All emission and outbox-write code lives in the service files.
- **`refund` on `order.cancelled`** is a design choice to carry policy alongside the fact, preventing listeners from re-deriving refund eligibility from context.
