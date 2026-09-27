---
source: src/modules/orders/events.ts
sha256: 2837c57bb6917c89748a914bf764c9310dbbc9ec00594d4d38d8009e3cbef604
generated_at: 2026-09-27T15:10:43.262173+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Defines the four domain events the orders module emits by augmenting the kernel's `DomainEventMap` (rather than editing it directly, so the catalogue grows per-module). Because `orders` sits low in the dependency graph and upstream consumers (payments, delivery) can depend on it but not vice-versa, event emission is the only channel for announcing state changes.

## Key elements

- **`declare module '@kernel/events'`** — extends `DomainEventMap` with four payloads:
  - `order.cancelled` — `{ orderId, refund: boolean }`. Emitted after the cancel write; `refund` encodes customer-vs-operator policy so the listener needn't infer it.
  - `order.refund_owed` — `{ orderId }`. Internal-only retry signal for `payments`; deliberately split from `order.cancelled` so a refund retry doesn't re-fire the customer-facing webhook.
  - `order.status_changed` — `{ orderId, from, to }`. Fired on any status move regardless of origin (system, admin override, etc.); listeners filter on `to`.
  - `order.created` — `{ orderId }`. Emitted once by `placeOrder` (the sole new-order writer).
- **`ORDER_CANCELLED`, `ORDER_REFUND_OWED`, `ORDER_STATUS_CHANGED`, `ORDER_CREATED`** — exported string constants so emitters and listeners share a single spelling.
- **`OrderStatus`** (imported from `@types`) — used in the `order.status_changed` payload.

## Relationships

- **`src/modules/orders/services/cancel.ts`** — emits `ORDER_CANCELLED` (after the write, under the `$in` at-most-once guard) and `ORDER_REFUND_OWED` when a refund is still pending.
- **`src/modules/orders/services/place.ts`** — `placeOrder` is the sole emitter of `ORDER_CREATED`, guaranteeing exactly-once per order regardless of caller.
- **`src/modules/orders/services/override.ts`** — a status-only admin override that produces `ORDER_STATUS_CHANGED`; indistinguishable in the event from any other status move.
- **`src/modules/orders/services/status.ts`** — ordinary system-driven status transitions, also emitting `ORDER_STATUS_CHANGED`.
- **`src/types/index.ts`** — provides the `OrderStatus` union used in `order.status_changed`.
- **`asyncapi.public.yaml`** — documents the externally-visible events (`cancelled`, `status_changed`, `created`). `order.refund_owed` is explicitly excluded: it has no AsyncAPI channel.
- **Integration tests** (`cancel.test.ts`, `pending-effects.test.ts`, `service-override.test.ts`, `service-status.test.ts`) — assert that each service emits the correct event with the correct payload.

## Notes

- `order.refund_owed` is **internal-only**; it will never appear in the public AsyncAPI spec or trigger a webhook.
- `order.status_changed` is deliberately source-agnostic. Do not add a `source`/`actor` field without re-evaluating every listener that currently filters only on `to`.
- The `refund` boolean on `order.cancelled` is a policy decision (customer cancel → true, operator cancel → false) baked into the event at emit time; listeners should not re-derive it.
- Emission order for a cancel: the write commits first, then `ORDER_CANCELLED` fires, then `ORDER_REFUND_OWED` (if a refund is still owed). The split prevents a payments retry sweep from duplicating the customer webhook.
