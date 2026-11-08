---
source: src/modules/orders/events.ts
sha256: b4b9f9be3c698d535a545ad7f9ca904a1f151da4380b4c9e95d248bfda8f3341
generated_at: 2026-11-08T06:51:50.781237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Declares the six domain events the orders module emits and exports their name constants. It augments the kernel's `DomainEventMap` (via `declare module '@kernel/events'`) so the event catalogue grows per-module without a central registry. Because `orders` sits low in the dependency graph (payments and delivery depend on it, never the reverse), emitting events is its only channel outward.

## Key elements

- **`declare module '@kernel/events'` block** — extends `DomainEventMap` with six event payload types:
  - `order.canceled` — `{ orderId, refund, cause }`; emitted when a cancel commits. `refund` is a policy flag, not a fact; `cause` drives mail and downstream compensation.
  - `order.status_changed` — `{ orderId, from, to }`; emitted on every status move (including the one backward move: lost shipment reopens `shipped` → `processing`). Listeners filter on `to`.
  - `order.created` — `{ orderId }`; emitted once by `placeOrder`, the single writer of new orders.
  - `order.status_overridden` — `{ orderId, from, to, at, mode: 'status' }`; admin manual forward override; internal only (no AsyncAPI/webhook).
  - `order.redacted` — `{ orderId }`; GDPR Art. 19 webhook trigger after personal-data scrub.
  - `order.purchase_hold_placed` — `{ tenantId, userId, until }`; internal-only notice to staff; no webhook.
- **Six exported string constants** (`ORDER_CANCELED`, `ORDER_STATUS_CHANGED`, `ORDER_CREATED`, `ORDER_STATUS_OVERRIDDEN`, `ORDER_REDACTED`, `ORDER_PURCHASE_HOLD_PLACED`) — single source of truth for the event name so emitters and listeners share one spelling.

## Relationships

- **`services/cancel.ts`** — defines `CancelCause` (imported here); writes `order.canceled` to the outbox in its own transaction.
- **`services/announce.ts`** — writes `order.status_changed` to the outbox in the status-write transaction.
- **`services/purchase-hold.ts`** — emits `order.purchase_hold_placed`; idempotent (a redelivered cancel finds the hold already present and skips).
- **`repository.ts`** — the order rows whose mutations trigger the events; events are committed in the same transaction as the row write.
- **`module.ts` / `index.ts`** — wire the module into the kernel and re-export the constants for downstream import.
- **Integration tests** (`cancel`, `outbox`, `purchase-hold`, `service-status`, `service-override`, `mail-listeners`, `hierarchy`) — assert that each event is written to the outbox exactly when and only when its service commits.
- **`tests/unit/public-events.test.ts`** — verifies the shape and completeness of the exported event map.

## Notes

- Every event is delivered **at-least-once** (transactional outbox → relay); listeners must dedupe on `meta.eventId`. The `$in` guard at write time makes the *write* at-most-once.
- `order.status_changed` includes the **only backward transition** in the lifecycle (lost shipment: `shipped` → `processing`). Listeners that assume monotonic status progression will break.
- `order.status_overridden` and `order.purchase_hold_placed` are **internal-only** — no AsyncAPI channel, no webhook.
- The `refund` flag on `order.canceled` is a policy decision carried with the event (customer cancel ⇒ refund; operator cancel ⇒ maybe not). `payments` treats it as the sole durable refund promise and retries until its record exists.
- `order.created` fires exactly once per order regardless of entry point (admin create, storefront checkout) because `placeOrder` is the single write path.
