---
source: src/modules/orders/events.ts
sha256: 8bbd218acdd63d6330c2644df8349d5ae239a16ec9e333c56a3ad95c23ee6a8f
generated_at: 2026-09-23T19:03:03.492911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Declares the domain events the orders module emits by augmenting the kernel's `DomainEventMap`, and exports the corresponding string constants so emitters and listeners share a single spelling. Because `orders` sits low in the dependency graph (payments and delivery depend on it, never the reverse), emitting events is the sole mechanism by which it signals state changes to downstream modules.

## Key elements

- **`DomainEventMap` augmentation (`declare module '@kernel/events'`)** — Adds three event payload types to the app-wide event map:
    - `'order.cancelled'` — `{ orderId: string; refund: boolean }`. Emitted after the cancel write; `refund` carries the policy decision with the fact.
    - `'order.status_changed'` — `{ orderId: string; from: OrderStatus; to: OrderStatus }`. Emitted on any status transition regardless of origin (system move or admin override).
    - `'order.created'` — `{ orderId: string }`. Emitted exactly once per new order from `placeOrder`.
- **`ORDER_CANCELLED`** (`'order.cancelled'`) — String constant for the cancel event name.
- **`ORDER_STATUS_CHANGED`** (`'order.status_changed'`) — String constant for the status-change event name.
- **`ORDER_CREATED`** (`'order.created'`) — String constant for the created event name.

## Relationships

- **`src/types/index.ts`** — Imports the `OrderStatus` type used in the `order.status_changed` payload.
- **`src/modules/orders/services/cancel.ts`** — Emits `order.cancelled` after a successful cancellation write.
- **`src/modules/orders/services/status.ts`** — Emits `order.status_changed` when a system-driven status transition occurs.
- **`src/modules/orders/services/override.ts`** — Also emits `order.status_changed`; the event does not distinguish override-originated transitions from ordinary ones.
- **`src/modules/orders/services/place.ts`** — `placeOrder` emits `order.created`; it is the single writer of new orders.
- **`src/modules/orders/index.ts`** / **`module.ts`** — Module barrel/registration; re-exports or wires the event constants and the augmented map for the wider app.
- **`asyncapi.public.yaml`** — Public API spec that documents these events for external consumers.
- **`src/modules/orders/tests/integration/*.test.ts`** — Integration tests assert that the correct event (and payload) is emitted for cancel, status-change, and creation flows.

## Notes

- Events are **fire-and-forget announcements**: the file defines _what_ is emitted, not _when_ or _how_. Emission lives in the service files listed above.
- `order.status_changed` is deliberately **indistinguishable by origin** (admin override vs. system move). Listeners that care about "who moved it" must consult audit logs, not the event.
- The `refund` field on `order.cancelled` exists because the policy (customer-cancel → refund; operator-cancel → possibly no refund) is decided at emit time; listeners should not re-derive it.
- Payload types are added via **module augmentation**, not by editing the kernel's map directly — this keeps the catalogue extensible per-module without a central edit.
