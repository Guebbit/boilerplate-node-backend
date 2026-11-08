---
source: src/modules/delivery/tests/integration/preorder-late.test.ts
sha256: 1f02d30dae8e4d60c82f7a6163989579ca84468f9a24ce999aab6a46c315f3db
generated_at: 2026-11-08T05:43:36.000592+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-late.test.ts

## Purpose
Integration test for the "release date moves later" scenario (PRODUCT_STATES P5) on a paid preorder. It verifies that the delivery module notifies the buyer, updates the fulfillment order to stay in `on_hold` with the new `expectedAt`, emits a `fulfillment_order.delayed` event, and sends exactly one email—using a real Mongo database and a real outbox, with only the mailer mocked at its queue boundary.

## Key elements

- **`preorder(days, quantity)`** — factory helper that places a paid preorder and creates its fulfillment orders (the same effect the paid-listener would have).
- **`moveDate(productId, to)`** — simulates an admin changing a product's `releaseDate` via `productService.updateById`, then flushes the outbox with `settleOutboxNudges` so the delivery module reacts.
- **`waitingOf(orderId)`** / **`statusOf`** / **`promisedAtOf`** / **`expectedAtOf`** — read-only query helpers that pull the single fulfillment order whose `holdReason` is `awaiting_stock`.
- **`delayedEvents()`** — queries the outbox collection for `fulfillment_order.delayed` events in insertion order.
- **`viewsOf(orderId, userId)`** — returns the buyer-facing, export, and board (presenter) representations of the fulfillment order for side-by-side assertions.
- **`describe('a release date that moves')`** — 13 test cases covering: later date (various magnitudes), multiple successive moves, clearing the date, re-announcing a cleared date, earlier date (silent), multi-product group losing one date, idempotent redelivery, and a fulfillment order that has already received stock.
- **`describe('what the buyer, the export and the board see…')`** — asserts that all three presenter views carry the updated date and last-notice fields without introducing anything the buyer must answer.
- **Mailer mock** — `enqueueEmail` is replaced with `jest.fn()`; every other dependency is real.
- **`beforeEach`** — resets domain events, calls `deliveryModule.subscribe()`, and marks events wired, so each test runs in a clean subscription state.

## Relationships

- **`@infrastructure/adapters/mailer`** — the sole mocked dependency; tests assert call count and never inspect queue internals.
- **`@kernel/outbox`** — `settleOutboxNudges` is the trigger that causes the delivery module to react to a date change; `outboxEventModel` is queried to read emitted events.
- **`@kernel/events`** — `resetDomainEvents` / `markDomainEventsWired` manage the global event-bus wiring per test.
- **`@modules/delivery/module`** — `deliveryModule.subscribe()` wires the handlers that the tests exercise.
- **`@modules/delivery/services`** — `deliveryService.onDateChanged` is called directly to test idempotency; `deliveryService.listFulfillmentOrdersForOrder` feeds the buyer-view assertion.
- **`@modules/delivery/presenter`** — `presentExportFulfillmentOrder` and `presentPreorderFulfillmentOrder` produce the wire shapes compared in the view-assertion suite.
- **`@modules/delivery/tests/factories`** — `paidPreorderOrder` and `fulfillmentOrdersOf` create the seed data.
- **`@modules/products`** — `productService.updateById` is the "admin moves the date" action under test.
- **`@modules/shop`** — `shopDayOf` normalises the target date the way the shop layer would.
- **`@tests/callers`** — `asCustomer` and `testCallerContext` supply the auth context for service calls.
- **`@tests/setup-test-db`** — boots a real Mongo instance for the whole file.

## Notes

- The outbox is the *only* mechanism that drives the delivery module's reaction in these tests. A date change that doesn't produce an outbox nudge will not trigger the handler; `moveDate` always calls `settleOutboxNudges` to ensure delivery.
- "Earlier date" and "date given after a clear" are intentionally *silent*—no event, no email. Tests assert this to lock in the "shop only tells" contract.
- The `promisedAt` chain: each new notice records the *previous* `expectedAt` as its `promisedAt`, so a series of moves produces a linked chain (`first.expectedAt === second.promisedAt`).
- The file is truncated in the source snapshot; the second `describe` block's assertions are partially missing.
- A `typesOf` helper is referenced in one test (the "cleared date announced twice" case) but is defined in the truncated portion.
