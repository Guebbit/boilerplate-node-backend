---
source: src/modules/delivery/tests/integration/release-date-impact.test.ts
source_sha256: 2d8b5aa47e9157f3b30a3da6adc4fc1fd451064eb8b94ac5eec2a50b7aed7bc7
context_sha256: c1b1c4d6499f90049d580723192148fd8ed77965185ebe0aa79dd7289128cc36
generated_at: 2026-11-22T05:02:46.945485+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/release-date-impact.test.ts

## Purpose
Integration test checking that the release-date preview (`deliveryService.previewDateImpact`) agrees with what actually happens when a product's release date is moved. For each case in a table, the preview's `notify` count must equal the number of distinct orders that receive `fulfillment_order.delayed` outbox events after the real save. It runs against real Mongo and a real outbox; only the mailer queue is mocked.

## Key elements
- **`setupTestDb()`, `beforeEach`/`afterEach`**: set up the test DB. Each test resets domain events, subscribes `deliveryModule`, and calls `markDomainEventsWired()`. Teardown resets events and clears mocks.
- **`jest.mock('@infrastructure/adapters/mailer')`**: replaces `enqueueEmail` with a `jest.fn()`.
- **`inDays(days)`**: returns a date `days` from now.
- **`moveDate(productId, to)`**: calls `productService.updateById` with `releaseDate` set to `shopDayOf(to)` (or `null`), then `settleOutboxNudges()` so the outbox is processed.
- **`delayedEvents()`**: reads `fulfillment_order.delayed` rows from `outboxEventModel`, sorted by `_id`, and returns their payloads.
- **`countOf(before)`**: counts distinct `orderId`s among events written after the first `before` events, returned as `{ notify }`.
- **`preview(productId, to)`**: calls `previewDateImpact(productId, 'preorder', to ?? undefined)`. It throws if the result is not a success.
- **`preorder(...dates)`**: creates one paid preorder order with one line per date, then creates its fulfillment orders.
- **`currentDate(productId)`**: reads the product's current `releaseDate` via `findByIdRaw`.
- **`describe('the preview matches what the save then does')`**: an `it.each` table of 11 cases, each with an expected `{ notify }`:
  - later date, long slip, second slip
  - earlier date
  - next shop day, same shop day
  - cleared date, cleared again
  - unchanged date
  - a group of two products moving later or earlier
  
  Each case checks that the preview writes no events, that it equals the expected value, and that it equals the count from the real move.
- **`describe('the preview')`**: three tests.
  - A missing product gives `{ success: false, status: 404 }`.
  - An order with two fulfillment orders waiting on the same product counts once.
  - The result has no `ask` or `answerBy` property.

## Relationships
- `@modules/products` (`productService`) performs the real date change; `@modules/shop` (`shopDayOf`) normalizes dates to shop days.
- `@modules/delivery/services` (`deliveryService`) provides the preview under test. `@modules/delivery/module` is subscribed so the move produces `delayed` events.
- `@modules/delivery/tests/factories` provides `paidPreorderOrder` and `fulfillmentOrdersOf`. `@modules/delivery/model` (`fulfillmentOrderModel`) is used to duplicate a fulfillment order.
- `@kernel/outbox` provides `outboxEventModel` and `settleOutboxNudges`. `@kernel/events` provides `resetDomainEvents` and `markDomainEventsWired`.
- `@tests/setup-test-db`, `@tests/callers` (`testCallerContext`) and `@tests/ids` (`MISSING_ID`) are shared test support.

## Notes
- Cases are `[name, initial offsets, optional first move, target, expected]`. The target `'same'` means "reuse the product's current date" and `null` means "clear it". A first move of `null` clears the date before the measured move.
- Only events written after the pre-move count (`before`) are counted, so an earlier slip does not affect the comparison.
- The preview always uses the `'preorder'` mode.
