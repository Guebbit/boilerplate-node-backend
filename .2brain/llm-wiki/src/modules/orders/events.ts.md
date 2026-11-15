---
source: src/modules/orders/events.ts
sha256: 5665dd8448eabc7378d857f05f4a0d6ec38d9647d360f50822e3f92a39ed6c35
generated_at: 2026-11-14T20:37:40.423497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/events.ts

## Purpose

Declares every domain event the orders module emits by augmenting the kernel's `DomainEventMap` interface (via `declare module '@kernel/events'`), so the app-wide event catalogue grows with the module that owns each event rather than being edited centrally. Also exports one string constant per event name so emitters and listeners share a single spelling instead of duplicated literals.

## Key elements

- **`declare module '@kernel/events'`** — augments `DomainEventMap` with six payload types:
  - `order.canceled` — fired when a cancel completes (stock restored); carries `refund`, `cause`, and optional `informedAt`.
  - `order.status_changed` — fired on any status transition, forward *or* backward; carries `from`/`to`.
  - `order.created` — fired once per new order, regardless of caller path.
  - `order.status_overridden` — fired when an admin hand-overrides a status forward; internal only.
  - `order.redacted` — fired when personal data is scrubbed; internal only (GDPR webhook).
  - `order.purchase_hold_placed` — fired when a shop rule pauses a buyer's checkout; internal only.
- **`ORDER_CANCELED`, `ORDER_STATUS_CHANGED`, `ORDER_CREATED`, `ORDER_STATUS_OVERRIDDEN`, `ORDER_REDACTED`, `ORDER_PURCHASE_HOLD_PLACED`** — exported string constants mirroring the keys above.
- **`CancelCause`** (imported from `./services/cancel`) — the union type used as the `cause` field in `order.canceled`.

## Relationships

- **src/modules/orders/index.ts** — barrel file that re-exports this module's constants to the wider app.
- **src/modules/orders/module.ts** — module registration surface; wires the orders module (and its events) into the kernel.
- **src/modules/orders/services/cancel.ts** — source of the `CancelCause` type imported here; writes the canceled event to the transactional outbox in the cancel's own transaction.
- **src/modules/orders/services/announce.ts** — writes the status-changed event to the outbox in the same transaction as the status write.
- **src/modules/orders/services/purchase-hold.ts** — emits the purchase-hold-placed event once per hold actually taken.
- **src/modules/orders/services/status.ts** — the status transition logic whose outcome is announced via the status-changed event.
- **src/modules/orders/tests/unit/public-events.test.ts** — unit-tests the shape and constants defined in this file.
- **src/modules/orders/tests/integration/cancel.test.ts** — asserts the canceled event is written to the outbox alongside the cancel.
- **src/modules/orders/tests/integration/outbox.test.ts** — asserts events are written to and relayed from the transactional outbox.
- **src/modules/orders/tests/integration/service-override.test.ts** — asserts the status-overridden event is emitted on admin override.
- **src/modules/orders/tests/integration/service-status.test.ts** — asserts the status-changed event is emitted on status transitions.
- **src/modules/orders/tests/integration/purchase-hold.test.ts** — asserts the purchase-hold-placed event fires once per hold.
- **src/modules/orders/tests/integration/mail-listeners.test.ts** — asserts event-driven mail sending (e.g. cancel mail from the canceled event).
- **src/modules/orders/tests/integration/hierarchy.test.ts** — asserts dependency direction: payments and delivery depend on orders, never the reverse.

## Notes

- `order.status_changed` is **not** monotonically forward: `shipped → processing` (lost shipment) and `delivered → reship` (replacement) are valid backward moves. Listeners must not assume strict ordering.
- Delivery is **at-least-once** (transactional outbox + relay). Listeners are expected to deduplicate on `meta.eventId`.
- `order.redacted` and `order.purchase_hold_placed` are **internal-only**: no AsyncAPI channel, no external webhook.
- `informedAt` on `order.canceled` is explicitly **never published** externally; it exists for the 14-day refund-deadline computation.
- The module sits low in the dependency graph (payments and delivery depend on orders, never the reverse), so event emission is the *only* way orders communicates outward.
