---
source: src/modules/delivery/tests/integration/backorder.test.ts
generated_at: 2026-11-22T05:00:35.314146+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/backorder.test.ts

## Purpose
Integration tests for how the delivery module handles a paid backorder. They cover the grouping rule (shelf stock ships now, the owed part waits `on_hold` for stock), the daily preorder sweep, stock arrival releasing held parts, and what buyers are told when a product's restock date moves. They run against a real test DB, real inventory and a real outbox. Only the mailer queue is mocked.

## Key elements
- `mockEnqueueEmail`: `jest.mocked` of `enqueueEmail`, with `@infrastructure/adapters/mailer` replaced by a `jest.mock` factory. It is only asserted in one case, where it must not have been called.
- `beforeEach` / `afterEach`: reset domain events, subscribe `deliveryModule`, call `markDomainEventsWired()`, then reset events and clear mocks after each test.
- `inDays(days)` / `DAY`: helpers that build a date relative to now.
- `moveRestockDate(productId, to)`: calls `productService.updateById` with `restockDate` (via `shopDayOf`, or `null` to clear it), then `settleOutboxNudges()`.
- `waitingOf(orderId)`: returns the fulfillment order with `holdReason === 'awaiting_stock'`.
- `delayedEvents()`: reads `fulfillment_order.delayed` rows from `outboxEventModel`, sorted by `_id`, and returns their payloads.
- Test groups:
  - **Grouping a paid backorder**: partial shelf stock gives an `open` fulfillment order plus an `on_hold` one with `cause: 'backorder'`. `agreedAt` equals the restock date the buyer saw. A promise that was the 30-day default sets `defaulted: true`. Full shelf cover holds nothing.
  - **The daily sweep**: `deliveryService.runPreorderSweep` notifies a 30-day-default buyer around day 30, not at day 28.5, with a `delayed` event of reason `due`.
  - **Stock arriving**: `inventoryService.receive` releases the owed part to `open`.
  - **A restock date that moves**: a later date, or a cleared date, emits a `delayed` event with reason `moved` and leaves the order `on_hold`. A 30-day-default buyer is left untouched and gets no mail. A `releaseDate` change does not trigger `delayed` for a backorder buyer.

## Relationships
- `@modules/delivery/tests/factories`: supplies `paidBackorderOrder` (returns `orderId`, `productId`) and `fulfillmentOrdersOf`.
- `@modules/delivery/module`: the subject under test. Its subscriptions are wired via `subscribe()` in `beforeEach`.
- `@modules/delivery/services`: provides `deliveryService`, whose `runPreorderSweep` is called directly in the sweep test.
- `@kernel/events`: `resetDomainEvents` and `markDomainEventsWired` control event wiring per test.
- `@kernel/outbox`: `outboxEventModel` is queried for `delayed` events, and `settleOutboxNudges` flushes pending outbox delivery.
- `@modules/products`: provides `productService`, used to change restock and release dates.
- `@modules/inventory`: provides `inventoryService`, used to receive stock.
- `@modules/shop`: `shopDayOf` converts a Date to the shop-day value stored in the date fields.
- `@infrastructure/adapters/mailer`: mocked.
- `@tests/setup-test-db` (`setupTestDb`) and `@tests/callers` (`testCallerContext`): DB setup and the caller context passed to service calls.

## Notes
- Without `settleOutboxNudges()`, the event-driven results (`delayed`, release on receive) would not be observable. The tests call it after each triggering action.
- `delayedEvents()` is asserted with `toMatchObject` on arrays, so each case also checks how many events were written.
- The file's header comment points to a `@see` doc reference, `docs/modules/delivery.md#preorders-and-a-moved-date`. That path is only cited in the comment, and I could not confirm it as a file in this repository.
