---
source: src/modules/delivery/tests/integration/preorder.test.ts
sha256: 6bd126c81cd8358525e0bdde618449cafdafa0a45013412f4ab49566d878434f
generated_at: 2026-11-08T05:43:51.528772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder.test.ts

## Purpose

Integration test that exercises the full paid-preorder delivery lifecycle against a real database and real outbox. It verifies the seam between the inventory and delivery modules: that fulfillment orders start `on_hold` for stock, that a stock receipt allocates units (releasing whole or splitting short), and that the grouping rule reads the order's frozen release date rather than the live catalogue.

## Key elements

- **`inDays(days)`** — returns a `Date` offset from now by the given number of days; used to build future release dates.
- **`receiveAndSettle(productId, quantity)`** — helper that calls `inventoryService.receive` then `settleOutboxNudges`, simulating a physical delivery arriving and its outbox announcement being processed.
- **`describe('grouping a paid preorder')`** — asserts the initial `on_hold` / `awaiting_stock` state and that the order's frozen date is used even if the catalogue date has since changed.
- **`describe('stock arriving for a paid preorder')`** — covers whole-release (full quantity arrives → single `open` order), split-release (partial arrival → one `open` + one `on_hold` order inheriting the promise date), lazy creation when the paid-event listener never fired, idempotency of a duplicate `releaseAllocated` call, and earliest-promise-first ordering when one product is held for two dates.

## Relationships

- **`src/kernel/events.ts`** — `resetDomainEvents()` and `markDomainEventsWired()` are called in `beforeEach`/`afterEach` to isolate the event bus between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is invoked after each `inventoryService.receive` to drain the outbox and trigger delivery-side side effects.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` registers the module's event listeners so that order-paid and inventory events reach the delivery service.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.releaseAllocated` is called directly in the idempotency test to simulate a duplicate outbox nudge.
- **`src/modules/delivery/tests/factories.ts`** — provides `paidPreorderOrder` (creates a paid order + backorder) and `fulfillmentOrdersOf` (reads the fulfillment orders for an order).
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService.receive`, `setBackorderLimit`, `reserveForOrder`, `commitForOrder` are the real inventory operations under test.
- **`src/modules/orders/index.ts` / `services/index.ts`** — `orderService.getById` is used to assert the `fulfillment` projection stored on the order document.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build multi-line orders with per-line preorder dates.
- **`src/modules/products/index.ts` / `services/index.ts`** — `productService.updateById` mutates the catalogue release date to prove the grouping rule ignores it.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the product fixture.
- **`src/modules/shop/index.ts`** — `shopDayOf` formats a timestamp into the shop's day format for the catalogue-update assertion.

## Notes

- The test file's doc comment states its intent explicitly: it tests the **seam** between inventory and delivery, not either module in isolation.
- Split deliveries produce a **new** fulfillment order (not a mutation of the existing one); the new order inherits `agreedAt` so downstream "Late view" and notice logic still see the promise.
- The "listener never ran" test confirms that `fulfillmentOrdersOf` (or the settlement path) can lazily materialize the fulfillment order if the paid-event handler was skipped — a resilience check, not a happy path.
- `shopDayOf` is used solely to produce a valid shop-day value when overwriting the catalogue date; it does not participate in delivery logic.
