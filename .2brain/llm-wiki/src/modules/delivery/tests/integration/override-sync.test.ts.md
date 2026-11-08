---
source: src/modules/delivery/tests/integration/override-sync.test.ts
sha256: 23dbf6f245c677340d5f3677ea5e262f0606d10d7127811dc4b566aed333da75
generated_at: 2026-11-08T05:42:56.427407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/override-sync.test.ts

## Purpose

Integration test verifying that when an admin overrides an order's status forward (`shipped` or `delivered`), the delivery module's event handler force-creates or completes shipments at the override's own recorded instant, without sending email or emitting public `shipment.*` domain events. Also confirms idempotency (re-delivering the event is a no-op) and that a backward override to `processing` leaves fulfillment records untouched.

## Key elements

- **`processingOrder()`** — Sets up a 3-unit order in `processing` state: creates user/product, reserves and commits inventory, and ensures a fulfillment order exists. Returns `orderId` and `productId`.
- **`override(orderId, to)`** — Calls `orderService.overrideStatus` as admin, then `settleOutboxNudges()` so the delivery event handler has a chance to react.
- **`overriddenAt(orderId)`** — Reads the `at` timestamp from the last override timeline row (the instant the deadline was counted from).
- **`describe('an override forward to shipped')`** — Three tests: forced shipment at override instant with no mail/webhook; partial-remainder correctness (only unshipped units, shelf decremented once); idempotency on re-delivery.
- **`describe('an override forward to delivered')`** — Two tests: all shipments stamped `delivered` at the override instant with `withdrawUntil` set to `at + 30d`; backward override to `processing` creates no shipments and leaves fulfillment `open`.

## Relationships

- **`@kernel/events`** — `resetDomainEvents`, `markDomainEventsWired`, `onDomainEvent` are used to wire/unwire domain-event listeners and to spy on whether `SHIPMENT_SHIPPED` / `SHIPMENT_DELIVERED` are announced.
- **`@kernel/outbox`** — `settleOutboxNudges` flushes the outbox so the delivery module's subscriber processes the override event synchronously within the test.
- **`@modules/delivery/module`** — `deliveryModule.subscribe()` registers the module's event handlers (including the override-sync handler under test) in each test.
- **`@modules/delivery/events`** — Imports `SHIPMENT_SHIPPED` and `SHIPMENT_DELIVERED` constants to listen for (and assert absence of) public announcement.
- **`@modules/delivery/services`** — `deliveryService.shipFulfillmentOrder` and `deliveryService.syncWithOverride` are called directly to set up partial shipments and to exercise idempotency.
- **`@modules/delivery/tests/factories`** — `fulfillmentOrdersOf` and `shipmentsOf` provide read-access helpers for asserting fulfillment/shipment state.
- **`@modules/orders` / `@modules/orders/services`** — `orderService.overrideStatus`, `orderService.getById`; `withdrawUntilFrom` for the expected deadline value.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem`, `lastOverrideOf` for order setup and reading the override timestamp.
- **`@modules/inventory` / `@modules/inventory/services`** — `inventoryService.reserveForOrder`, `commitForOrder`, `listMovements` to verify shelf is decremented exactly once.
- **`@modules/products/tests/factories`** — `createProduct`, `countersOf` for stock assertions.
- **`@modules/users/tests/factories`** — `createUser` for order ownership.
- **`@infrastructure/adapters/mailer`** — Fully mocked (`jest.mock`); asserted **not** called for override-driven shipments/deliveries.

## Notes

- The mailer mock is cleared in `beforeEach` but the `delivered` test calls `settleOutboxNudges()` + `mockClear()` *after* a normal ship to isolate the override's mail behaviour.
- Timestamps (`shippedAt`, `deliveredAt`, `withdrawUntil`) are all anchored to the override's own `at` instant (read from the timeline row), not to wall-clock time at test execution.
- Override to `processing` is a backward move and must not create or close any fulfillment/shipment records — this is an explicit guard against over-eager sync.
- The `forced: true` flag on the auto-created shipment distinguishes override-driven shipments from normal `deliveryService.shipFulfillmentOrder` calls (which produce `forced: false`, sequential numbering).
