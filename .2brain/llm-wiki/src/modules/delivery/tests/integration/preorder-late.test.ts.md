---
source: src/modules/delivery/tests/integration/preorder-late.test.ts
source_sha256: 5083f8623df2ef0f52b6b9e8f269817646269243f563fb24aae15d6c5894683a
context_sha256: b8c25c79a71e5aea34f0dc301d6f2f2c1b685c7bd5cfa00b6b2ef3173ba2c9da
generated_at: 2026-11-22T05:02:11.974124+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/preorder-late.test.ts

## Purpose
Integration test for a paid preorder whose release date slips (PRODUCT_STATES P5). It drives the real entry points: an admin changes a product's release date via `productService`, and `delivery` notifies the buyer through the outbox. The daily sweep is described as notifying once more when a date passes with no stock. The shop only informs: it asks nothing, cancels nothing, and silence leaves the buyer waiting. The notice, the fulfillment-order state change and the event are one transaction, and the email follows. Tests use real Mongo and a real outbox, with the mailer mocked at its queue.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer')` / `mockEnqueueEmail`: replaces `enqueueEmail` so cases can assert which mail was enqueued.
- `setupTestDb()` plus `beforeEach`/`afterEach`: reset domain events, call `deliveryModule.subscribe()`, then `markDomainEventsWired()`; afterwards reset events and clear mocks.
- `inDays`, `DAY`: date helpers.
- `preorder(days, quantity)`: creates a paid preorder via `paidPreorderOrder` and materializes its fulfillment orders.
- `moveDate(productId, to)`: calls `productService.updateById` with a `shopDayOf` date (or `null`), then `settleOutboxNudges()`.
- `waitingOf`, `statusOf`, `promisedAtOf`, `expectedAtOf`: read the order's `awaiting_stock` fulfillment order and selected fields.
- `delayedEvents()`: reads `fulfillment_order.delayed` events from `outboxEventModel`, in insertion order.
- `viewsOf(orderId, userId)`: returns the buyer view (`deliveryService.listFulfillmentOrdersForOrder` as customer), the export view (`presentExportFulfillmentOrder`) and the board view (`presentPreorderFulfillmentOrder`).
- `describe('a release date that moves')` covers these behaviors:
  - A later date produces one `reason: 'moved'` notice and an email. The order stays `on_hold`, and `lastNoticeAt` is set.
  - Slips of 75 days and 365 days produce the same event shape (a fixed key set).
  - The event carries the previously held date (`promisedAt`) and `shipCountry`. A second move finds the date given by the first.
  - Clearing the date notifies the buyer, leaves `expectedAt` undefined, and a later date after a clear is followed quietly.
  - An earlier date produces no event or email.
  - A redelivered `deliveryService.onDateChanged` is idempotent.
  - A fulfillment order that is no longer waiting (stock received through `inventoryService.receive`) is left alone.
- `describe('what the buyer, the export and the board see of a late preorder')`: begins after `viewsOf`. The visible content is cut off here.

## Relationships
- Mocks `src/infrastructure/adapters/mailer.ts` (`enqueueEmail`).
- Uses `src/kernel/events.ts` (`resetDomainEvents`, `markDomainEventsWired`) and `src/kernel/outbox.ts` (`outboxEventModel`, `settleOutboxNudges`) to wire and flush events.
- Subscribes `src/modules/delivery/module.ts` and calls `deliveryService` (imported from `@modules/delivery/services`) for `onDateChanged` and listing.
- Uses `src/modules/delivery/presenter.ts` for the export and board views.
- Imports `fulfillmentOrderRepository` from `src/modules/delivery/repository.ts`. Its use is not visible in the shown portion.
- Fixtures: `paidPreorderOrder` and `fulfillmentOrdersOf` from `src/modules/delivery/tests/factories.ts`, and `timelineOf` from `src/modules/orders/tests/factories.ts`.
- Drives `productService` from `src/modules/products/index.ts`.
- Uses `shopDayOf` from `src/modules/shop/index.ts`.
- `tests/support/callers.ts` provides `asCustomer` and `testCallerContext`. `tests/support/clock.ts` provides `freezeDate`, whose use is not visible in the shown portion.

## Notes
- `typesOf` is used in the "announced twice" case but is not imported or defined in the visible portion.
- A date set after "no date yet" is silent, and the buyer holds no promised date. Only clears and later dates tell.
- Dates are set by moving the product's date and settling the outbox, not by calling delivery directly, except in the redelivery cases.
