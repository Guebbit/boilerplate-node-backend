---
source: src/modules/delivery/tests/integration/override-sync.test.ts
sha256: e9839974e196f5eb293be6478d9f24d18b46be157bc2f927082c06b9ea09ad4a
generated_at: 2026-10-29T03:46:46.472808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/override-sync.test.ts

## Purpose

Integration tests for the delivery module's reaction to an admin status override that moves an order *forward* (to `shipped` or `delivered`). They verify that the override's event causes the delivery module to close out all remaining fulfillment lines as a single **forced** shipment at the override's own timestamp, without emitting any public `shipment.*` domain event or sending a customer email.

## Key elements

- **`processingOrder()`** – fixture: creates a 3-unit order in `processing` status, reserves + commits inventory, and ensures a fulfillment order exists.
- **`override(orderId, to)`** – calls `orderService.overrideStatus` as admin, then flushes outbox nudges so the delivery module actually receives the event.
- **`overriddenAt(orderId)`** – reads the timestamp from the order's last override timeline row (the "anchor instant").
- **`describe('an override forward to shipped')`** – three cases:
  - ships every remainder as one `forced: true` shipment stamped with the override instant, sends no mail, emits no `SHIPMENT_SHIPPED`/`SHIPMENT_DELIVERED` events.
  - ships only the *unshipped* remainder (2 of 3) and decrements inventory exactly once.
  - idempotency: a second call to `deliveryService.syncWithOverride` is a no-op.
- **`describe('an override forward to delivered')`** – two cases:
  - delivers all shipments at the override instant; `withdrawUntil` is computed from that same instant; no customer email.
  - an override *back* to `processing` leaves fulfillment records untouched (no shipments created).

## Relationships

- **`@kernel/events`** – `resetDomainEvents` / `markDomainEventsWired` / `onDomainEvent` set up the in-process event bus for assertions on (and against) `SHIPMENT_SHIPPED` / `SHIPMENT_DELIVERED`.
- **`@kernel/outbox`** – `settleOutboxNudges` flushes the outbox so the delivery module's subscriber fires synchronously within the test.
- **`@modules/delivery/module`** – `deliveryModule.subscribe()` wires the module's event handlers each test.
- **`@modules/delivery/events`** – provides the `SHIPMENT_SHIPPED` / `SHIPMENT_DELIVERED` constants used in event assertions.
- **`@modules/delivery/services`** – `deliveryService.shipFulfillmentOrder` (to pre-ship a partial line) and `deliveryService.syncWithOverride` (direct idempotency check).
- **`@modules/delivery/tests/factories`** – `fulfillmentOrdersOf`, `shipmentsOf` read delivery-state for assertions.
- **`@modules/orders` / `@modules/orders/services`** – `orderService.overrideStatus`, `orderService.getById`; `withdrawUntilFrom` from the withdrawal domain used to assert the deadline.
- **`@modules/orders/tests/factories`** – `createOrder`, `toOrderItem`, `lastOverrideOf` for fixture setup and timeline reads.
- **`@modules/inventory` / `@modules/inventory/services`** – `reserveForOrder`, `commitForOrder`, `listMovements` to verify stock is decremented exactly once.
- **`@infrastructure/adapters/mailer`** – mocked (`enqueueEmail`) to assert no customer email is enqueued by the override path.
- **`@modules/products/tests/factories`** – `createProduct`, `countersOf` for stock assertions.
- **`@modules/users/tests/factories`** – `createUser` for order ownership.

## Notes

- The central contract under test: the override's timeline row timestamp (`row.at`) is the single instant used for `shippedAt`, `deliveredAt`, *and* `withdrawUntil`—not the wall-clock time of the test.
- `forced: true` distinguishes override-created shipments from operator-initiated ones; shipment numbering continues (e.g. 1, 2) rather than resetting.
- The mailer mock is cleared in `beforeEach`; the delivered-override test additionally clears it after the partial-ship mail so only the override path is observed.
- `deliveryModule.subscribe()` is called in every `beforeEach`; forgetting this (or `markDomainEventsWired()`) silently breaks event delivery.
