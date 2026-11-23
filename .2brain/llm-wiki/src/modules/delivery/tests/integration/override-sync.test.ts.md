---
source: src/modules/delivery/tests/integration/override-sync.test.ts
source_sha256: 61a5e89041bea0942857555c3afea5fb67d89822c233380dcedfebefab108df0
context_sha256: eb1a324445d7ab13ec47e78055bf50abdffca745a10cafda2f748437b7cc45bf
generated_at: 2026-11-22T05:01:33.250744+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/override-sync.test.ts

## Purpose
Integration test for how an admin status override propagates to the delivery module's fulfillment records through the real domain events and outbox. It checks that overriding forward to `shipped` or `delivered` ships/delivers every remaining unit at the override's own instant (the one `withdrawUntil` is counted from), and that this sends no mail and emits no public `shipment.*` event.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` with a mock (`mockEnqueueEmail`) so cases can assert that no mail is queued.
- `setupTestDb()` plus a `beforeEach` that resets domain events, subscribes the delivery module, marks events as wired and clears the mail mock. `afterEach` resets events again.
- `processingOrder()`: creates a user, a product (onHand 10) and a 3-unit `processing` order. It reserves and commits stock, then materializes the fulfillment orders. It returns `{ orderId, productId }`.
- `override(orderId, to)`: overrides the order status as admin, then `settleOutboxNudges()` so delivery receives the event.
- `overriddenAt(orderId)`: reads the override instant from the order timeline via `lastOverrideOf`.
- Test groups:
  - **Override to `shipped`**
    - Creates one forced shipment at the override instant.
    - Closes the fulfillment order.
    - Sends no mail and emits no `SHIPMENT_SHIPPED`/`SHIPMENT_DELIVERED`.
    - Ships only the unshipped remainder (shipment 1 not forced, shipment 2 forced), with stock leaving the shelf once.
    - Is idempotent: a second `syncWithOverride` call adds nothing.
  - **Refused sync**: a mocked `claim` returning `null` makes `syncWithOverride` throw `DELIVERY_NOT_SHIPPABLE`, so the outbox can retry. The retry then ships the remainder.
  - **Override to `delivered`**
    - Delivers every shipment with `deliveredAt` equal to the override instant.
    - Sets `withdrawUntil` to `withdrawUntilFrom(at, 30)`.
    - Updates the order's `fulfillment` summary and sends no mail.
  - **Override to `processing`**: leaves shipments empty and the fulfillment order `open`.

## Relationships
- `@kernel/events` and `@kernel/outbox`: the test rewires domain events (`resetDomainEvents`, `markDomainEventsWired`, `onDomainEvent`) and drains the outbox with `settleOutboxNudges`.
- `@modules/delivery/module`: its default export is subscribed in `beforeEach` to register delivery's event handlers.
- `@modules/delivery/events`: `SHIPMENT_SHIPPED` and `SHIPMENT_DELIVERED` are listened to, to prove nothing is announced.
- `@modules/delivery/services`: `deliveryService` is exercised directly, calling `syncWithOverride` and `shipFulfillmentOrder`.
- `@modules/delivery/repository`: `fulfillmentOrderRepository` is spied on (its `claim` method) to simulate a lost race.
- `@modules/delivery/tests/factories`: `fulfillmentOrdersOf` and `shipmentsOf` read the resulting records.
- `@modules/orders`: `orderService` (used for the status override and `getById`) and `withdrawUntilFrom`.
- `@modules/orders/tests/factories`: `createOrder`, `toOrderItem` and `lastOverrideOf`.
- `@modules/inventory`: `inventoryService` reserves, commits and lists `ship` movements for stock assertions.
- `@modules/products/tests/factories`: `createProduct` and `countersOf` set up the product and check its stock counters.
- `@infrastructure/adapters/mailer`: mocked, as above.

## Notes
- The `claim` spy targets a repository internal because a competing write cannot be staged through a public entry point inside the single transaction. The spy is restored in a `finally` block.
- The "on its way" mail from a manual shipment is sent through its event. The delivered-override test therefore settles the outbox before clearing the mail mock, so only mail from the override itself is counted.
- Timestamps are compared by exact equality, so the shipment and order fields must be set from the same override instant rather than a fresh `new Date()`.
