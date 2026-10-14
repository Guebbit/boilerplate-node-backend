---
source: src/modules/delivery/tests/integration/override-sync.test.ts
sha256: a1ca575e8efcb68d7a8691415556ae44c5324c81a08a82b0297d215bb8b323d6
generated_at: 2026-10-14T15:36:19.724094+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/override-sync.test.ts

## Purpose

Integration tests for the delivery module's reaction to an admin status-override event. Verifies that forwarding an order to `shipped` or `delivered` causes all remaining fulfillment records to be closed at the override's own timestamp (the one `withdrawUntil` was counted from), marked `forced: true`, with **no** email sent and **no** public `shipment.*` domain event emitted. Also covers idempotent re-delivery of the same override event and confirms that a backward override (to `processing`) leaves fulfillment records untouched.

## Key elements

- **`processingOrder()`** – fixture helper: creates a 3-unit order in `processing` state, reserves and commits inventory, seeds a fulfillment order.
- **`override(orderId, to)`** – calls `orderService.overrideStatus` as an admin, then `settleOutboxNudges()` so the delivery module hears the event.
- **`overriddenAt(orderId)`** – reads the override's timestamp from the order's timeline row (`lastOverrideOf`).
- **`describe('an override forward to shipped')`** – three cases: full-remainder forced shipment (no mail, no public event, correct `shippedAt`, fulfillment closed); partial-shipment remainder (only unshipped units, single inventory deduction); idempotency (second call to `syncWithOverride` is a no-op).
- **`describe('an override forward to delivered')`** – two cases: all shipments get `deliveredAt` equal to the override instant and `withdrawUntil` is recalculated from that same instant; backward override to `processing` leaves fulfillment orders open and no shipments created.
- **Mailer mock** – `enqueueEmail` from `@infrastructure/adapters/mailer` is globally mocked; every assertion expects it was **not** called.

## Relationships

- **`src/modules/delivery/services/override-sync.ts`** – SUT under test; `syncWithOverride` is called directly in the idempotency case.
- **`src/modules/delivery/services/ship.ts`** – `shipFulfillmentOrder` creates a partial shipment *before* the override to test remainder logic.
- **`src/modules/delivery/events.ts`** – `SHIPMENT_SHIPPED` / `SHIPMENT_DELIVERED` are subscribed via `onDomainEvent` to assert they are **not** announced.
- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` wires the module's event handlers in `beforeEach`.
- **`src/modules/delivery/services/index.ts`** – barrel re-export used to import `shipFulfillmentOrder` and `syncWithOverride`.
- **`src/modules/delivery/tests/factories.ts`** – `fulfillmentOrdersOf`, `shipmentsOf` test helpers.
- **`src/modules/orders/index.ts` / `services/index.ts`** – `orderService` triggers the override and reads order state.
- **`src/modules/orders/domain/withdrawal.ts`** – `withdrawUntilFrom` used to verify deadline recalculation.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `lastOverrideOf`.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService` for reserve, commit, and movement assertions.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-test event bus.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so delivery hears the override.
- **`src/infrastructure/adapters/mailer.ts`** – mocked; never expected to be called in any test.

## Notes

- **Timestamp semantics:** `shippedAt` / `deliveredAt` on override-generated shipments are set to the override row's `at` value, **not** `Date.now()`. Tests assert exact equality with `overriddenAt(orderId)`.
- **`forced: true`** flag distinguishes override-generated shipments from operator-initiated ones; shipment numbering continues sequentially (1, 2, …).
- **Silent by design:** the override path intentionally emits no public `shipment.*` events and sends no email. The `announced` array must remain empty.
- **`settleOutboxNudges()` is mandatory** after `overrideStatus`; without it the delivery module never receives the event and the test would hang or fail.
- **Idempotency guard:** calling `syncWithOverride` a second time with the same `(orderId, status, at)` must not create a duplicate shipment — this is the explicit contract being tested.
