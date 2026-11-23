---
source: src/modules/delivery/tests/integration/preorder.test.ts
generated_at: 2026-11-22T05:02:30.470681+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/preorder.test.ts

## Purpose
Integration test for the delivery module's handling of a paid preorder. It checks that fulfillment orders are grouped from what the order froze, not from the catalogue. It also checks that they wait `on_hold` for stock, and that a receipt allocating stock releases them through the outbox. Real inventory and a real outbox are used, because the test targets the seam between the two modules.

## Key elements
- **Setup**: `setupTestDb()` runs once. A `beforeEach` resets domain events, calls `deliveryModule.subscribe()` and then `markDomainEventsWired()`. An `afterEach` resets domain events again.
- **Helpers**:
  - `DAY` is one day in milliseconds.
  - `inDays(days)` returns a release date `days` away.
  - `receiveAndSettle(productId, quantity)` calls `inventoryService.receive` and then `settleOutboxNudges()`.
- **`grouping a paid preorder`**:
  - A preorder line becomes one `on_hold` fulfillment order with hold reason `awaiting_stock`. Its `agreedAt` and `expectedAt` equal the release date the buyer saw. The stored order's fulfillment shows `onHold` and `awaitingStock` counts.
  - A later change to the product's catalogue `releaseDate` (via `productService.updateById`) does not affect the grouping.
- **`stock arriving for a paid preorder`**:
  - A delivery that covers the order releases the whole fulfillment order to `open` and clears `holdReason`.
  - A short delivery splits the order. The held part (qty 1) stays `on_hold` as number 1, and the arrived part (qty 2) becomes `open` as number 2. The new order inherits `agreedAt`.
  - If the paid listener never ran, receiving stock creates the fulfillment orders first and opens them.
  - Calling `deliveryService.releaseAllocated` twice with the same allocation is harmless.
  - A split that loses its race to claim the held fulfillment order throws `DELIVERY_NOT_RELEASABLE`. A retry then releases 2 of the 3 units, and the test asserts the quantities are `[1, 2]`.
  - When one order holds the same product for two release dates, receiving 1 unit opens the earlier-dated fulfillment order and leaves the later one `on_hold`.

## Relationships
- **Delivery**: `delivery/module.ts` supplies the module whose listeners the setup wires up. `delivery/services/index.ts` supplies the service the tests call to release allocated stock. `delivery/repository.ts` supplies the repository whose internal `claim` is spied on to simulate a lost race. `delivery/tests/factories.ts` supplies `fulfillmentOrdersOf` and `paidPreorderOrder`.
- **Inventory**: `inventory/index.ts` supplies the inventory service used for real in the tests (receiving stock, setting the backorder limit, reserving and committing for an order).
- **Kernel**: `kernel/outbox.ts` provides `settleOutboxNudges`. `kernel/events.ts` provides `resetDomainEvents` and `markDomainEventsWired` for per-test event isolation.
- **Orders, products and shop**:
  - `orders/index.ts` supplies the order service, read to check the stored order's `fulfillment` summary.
  - `orders/tests/factories.ts` supplies `createOrder` and `toOrderItem`, which build the frozen order in the two-dates test.
  - `products/tests/factories.ts` supplies `createProduct`.
  - `products/index.ts` supplies the product service, used to change the catalogue release date.
  - `shop/index.ts` supplies `shopDayOf`, which formats the new release date.

## Notes
- The `claim` spy is deliberate. The test file notes that a write winning the race cannot be staged through a public door inside the one transaction, so it mocks an internal of the repository. It uses `mockRestore` in a `finally` block.
- In the race test, `releaseAllocated` is called by hand instead of through a real receipt. A real receipt would announce the event and the listener would race.
- The "paid listener never ran" case calls `paidPreorderOrder` and then does not call `fulfillmentOrdersOf` before receiving stock. The other tests call `fulfillmentOrdersOf` first.
- The two-dates test freezes the same product twice with different `releaseDate` values. It uses a backorder limit of 3, a reservation of kind `backorder`, and `commitForOrder`.
