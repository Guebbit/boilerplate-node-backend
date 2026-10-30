---
source: src/modules/orders/events.ts
sha256: 6c6e90824e8fb2c67b39778469c8ad54a9ee8af4ba91fead83e430b433c6a6f0
generated_at: 2026-10-29T04:42:05.815348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Declares the order module's domain events by augmenting the kernel's `DomainEventMap` (via `declare module '@kernel/events'`), and exports string constants so emitters and listeners share one spelling. Because `orders` sits low in the dependency graph, these events are the only mechanism for announcing state changes to upstream modules (payments, delivery, notifications, webhooks).

## Key elements

- **`declare module '@kernel/events'`** — Augments `DomainEventMap` with six event payloads rather than editing the kernel directly:
  - `order.cancelled` — cancel confirmed; carries `refund` (policy) and `cause` (drives buyer mail and downstream resolution).
  - `order.status_changed` — any status transition, regardless of origin.
  - `order.created` — a new order row was committed.
  - `order.status_overridden` — admin forced a forward status move (internal only).
  - `order.redacted` — personal data scrubbed in a `reap:orders` transaction.
  - `order.purchase_hold_placed` — checkout paused by the shop's cancellation rule (internal only).
- **Exported constants** (`ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`, `ORDER_CREATED`, `ORDER_STATUS_OVERRIDDEN`, `ORDER_REDACTED`, `ORDER_PURCHASE_HOLD_PLACED`) — One canonical string per event name; used by emitters and listeners in place of bare literals.

## Relationships

- **`services/cancel.ts`** — Emits `order.cancelled` in its own transaction (transactional outbox, at-most-once write; at-least-once delivery).
- **`services/announce.ts`** — Writes `order.status_changed` to the outbox alongside the status write.
- **`services/purchase-hold.ts`** — Emits `order.purchase_hold_placed` once per hold taken.
- **`services/status.ts`** — Status transitions that produce `order.status_changed`.
- **`asyncapi.public.yaml`** — Public event contract; `order.status_overridden` and `order.purchase_hold_placed` are explicitly *not* exposed there.
- **`module.ts` / `index.ts`** — Module registration and barrel re-exports that surface these constants to consumers.
- **`repository.ts`** — The data layer whose writes trigger the outbox event emissions above.
- **Integration tests** (`cancel`, `purchase-hold`, `service-status`, `outbox`, `mail-listeners`, `hierarchy`, `service-override`) — Assert event payloads, outbox invariants, and listener behavior for the events defined here.

## Notes

- **Backward status move:** `shipped → processing` (lost-shipment reopen) is the only backward transition a listener will see on `order.status_changed`. Code that assumes monotonic status progression must special-case it.
- **Deduplication contract:** All outbox-delivered events are at-least-once; listeners are expected to dedupe on `meta.eventId`.
- **Internal vs. public:** `order.status_overridden` and `order.purchase_hold_placed` have no AsyncAPI channel and (for the latter) no webhook — they are in-process notifications only.
- **`refund` in `order.cancelled`** is the sole durable record of the refund obligation; `payments` opens its refund record from this field and the relay retries until it persists.
