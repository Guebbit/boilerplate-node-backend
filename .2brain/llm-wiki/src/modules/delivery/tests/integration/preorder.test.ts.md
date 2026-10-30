---
source: src/modules/delivery/tests/integration/preorder.test.ts
sha256: ba35284d00c6eeec489ecac3a2eb9ee5fdfda7311c9c05db7e57165bf78a0ff7
generated_at: 2026-10-29T03:47:39.677498+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder.test.ts

## Purpose

Integration test that verifies the paid-preorder flow across the delivery ↔ inventory seam: a preorder line is held (`on_hold` / `awaiting_stock`) until stock is received, the release date is read from the order's frozen snapshot (never the live catalogue), and incoming stock either releases the whole fulfillment order or splits it into an open partial plus a still-held remainder.

## Key elements

- **`inDays(days)`** – local helper; returns a `Date` offset from now by the given number of days (used for release dates).
- **`receiveAndSettle(productId, quantity)`** – calls `inventoryService.receive` then `settleOutboxNudges()`; models "stock arrives and the outbox delivers the announcement to delivery."
- **`describe('grouping a paid preorder')`** – two tests: the line is held with the buyer's promised date, and a later catalogue date change does not affect the already-frozen order.
- **`describe('stock arriving for a paid preorder')`** – five tests covering: full release (single order goes `open`), split delivery (partial opens, remainder stays `on_hold`), lazy fulfillment-order creation when the paid-listener never ran, idempotency of duplicate `releaseAllocated` calls, and earliest-promise-first ordering when one product is held for two dates.
- **`beforeEach` / `afterEach`** – resets domain events, subscribes `deliveryModule`, marks events wired; tears down after each test.

## Relationships

- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` in `beforeEach` wires the delivery module's domain-event listeners so that order-paid and inventory-received events are processed.
- **`src/modules/delivery/services/index.ts`** – `deliveryService.releaseAllocated` is called directly in the idempotency test to simulate a duplicate outbox announcement.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` creates a paid preorder order with configurable lines; `fulfillmentOrdersOf` queries the resulting fulfillment orders.
- **`src/modules/inventory/index.ts`** – `inventoryService.receive`, `setBackorderLimit`, `reserveForOrder`, `commitForOrder` drive the stock side of the flow.
- **`src/modules/orders/index.ts`** – `orderService.getById` is used to assert the order's `fulfillment` counters after each scenario.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the two-date preorder order in the "earliest promise first" test.
- **`src/modules/products/index.ts`** – `productService.updateById` changes the catalogue release date to prove the delivery module ignores it.
- **`src/modules/products/tests/factories.ts`** – `createProduct` sets up the product fixture.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the buyer.
- **`src/kernel/events.ts`** – `resetDomainEvents` / `markDomainEventsWired` control the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox entries so the delivery module actually receives the inventory-received signal.
- **`src/types/index.ts`** – `OrderStatus.paid` used when building the raw order in the two-date test.

## Notes

- The file relies on `setupTestDb()` called at module scope (injected via `@tests/setup-test-db`); the test does not manage its own database lifecycle.
- The "frozen date" invariant (test 2) is the core assertion that delivery reads `agreedAt`/`expectedAt` from the order document, not from `productService`'s current catalogue value.
- The idempotency test bypasses the outbox and calls `releaseAllocated` twice with the same quantity — this is the only test that exercises the service method directly rather than through the event/outbox path.
- The "earliest promise first" test manually drives the inventory reserve/commit sequence (`setBackorderLimit` → `reserveForOrder` → `commitForOrder`) because the two-date scenario cannot be expressed through the `paidPreorderOrder` factory alone.
