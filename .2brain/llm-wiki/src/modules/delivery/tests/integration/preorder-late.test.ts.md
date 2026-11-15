---
source: src/modules/delivery/tests/integration/preorder-late.test.ts
sha256: 32039edb372be823ee3810bbb5575a8ab74ed7092051da2e58cf1bcef15b5ac6
generated_at: 2026-11-14T19:53:45.878853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-late.test.ts

## Purpose

Integration test for the "late preorder" scenario (state P5): an admin moves a product's release date to a later date (or clears it), and the delivery module notifies the buyer via email and a `fulfillment_order.delayed` domain event while keeping the fulfillment order on hold. The test exercises the full path — real Mongo, real outbox processing, real product-service update — with only the mailer mocked at its queue boundary. It verifies that delivery *tells* (sends a notice, records state) but never *asks* or *cancels*.

## Key elements

- **`preorder(days, quantity)`** — creates a paid preorder order via the `paidPreorderOrder` factory and generates its fulfillment orders.
- **`moveDate(productId, to)`** — simulates the admin action: updates the product's `releaseDate` through the products module, then settles outbox nudges to trigger the delivery module's handler.
- **`waitingOf(orderId)` / `statusOf` / `promisedAtOf` / `expectedAtOf`** — query helpers that locate the single fulfillment order in `awaiting_stock` hold and read its fields.
- **`delayedEvents()`** — reads all `fulfillment_order.delayed` payloads from the outbox collection in insertion order.
- **`viewsOf(orderId, userId)`** — retrieves the three projections of one fulfillment order (buyer API, export, board) for consistency assertions.
- **`describe('a release date that moves')`** — main suite: later date, earlier date (silent), cleared date, multiple successive moves, idempotency on redelivery, multi-product groups, and non-waiting orders.
- **`describe('what the buyer, the export and the board see…')`** — verifies that all three views carry the new date, the last-notice timestamp, and expose nothing the buyer must answer.
- **`inDays(days)`** — local helper returning a `Date` offset from `Date.now()`.
- **Mock**: `enqueueEmail` from the mailer adapter is the sole external mock; everything else (Mongo, outbox, product service, shop) runs for real.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the test mocks this module's `enqueueEmail` export via `jest.mock` and asserts call counts; it is the only boundary faked.
- **`src/kernel/events.ts`** — provides the in-process event-bus reset and wiring used in `beforeEach`/`afterEach` to isolate handler subscriptions per test.
- **`src/kernel/outbox.ts`** — supplies the outbox model for reading emitted events and the `settleOutboxNudges` helper that flushes queued outbox entries after a product update.
- **`src/modules/delivery/module.ts`** — its default export is re-subscribed after each event-bus reset so that domain-event handlers are active for the test.
- **`src/modules/delivery/presenter.ts`** — provides the export and board view functions used in the "what the buyer sees" suite.
- **`src/modules/delivery/services/index.ts`** — the delivery service entry point; the test calls its public methods directly for idempotency checks and buyer-API queries.
- **`src/modules/delivery/tests/factories.ts`** — provides the `paidPreorderOrder` and `fulfillmentOrdersOf` factories that build the initial order and fulfillment rows.
- **`src/modules/orders/tests/factories.ts`** — provides `timelineOf`, used for timeline-shaped assertions in the truncated portion.
- **`src/modules/products/index.ts`** — the test imports `productService` from this barrel to perform the admin date-change that drives the whole scenario.
- **`src/modules/products/services/index.ts`** — the underlying product service implementation reached through the barrel import above.
- **`src/modules/shop/index.ts`** — provides `shopDayOf`, used to normalise a raw `Date` to the shop's day-granularity value before persistence.
- **`src/modules/shop/service.ts`** — the shop service implementation reached through the shop barrel import.
- **`tests/support/callers.ts`** — supplies `asCustomer` and `testCallerContext` for authenticated service calls.
- **`tests/support/setup-test-db.ts`** — provisions the real MongoDB instance used by the entire test file.

## Notes

- **Real infrastructure, one mock.** Unlike unit tests here, this file runs against actual Mongo and processes real outbox entries. Only the mailer queue is replaced, keeping the assertion surface at "was the queue told, and how many times."
- **Event-bus re-subscription is manual.** Resetting the event bus wipes handlers; the delivery module must be re-subscribed in `beforeEach`. Forgetting this yields silent no-op tests (events fire into a void).
- **Idempotency is a first-class concern.** Several tests re-invoke the date-changed handler with the same payload to confirm no duplicate email or event is produced.
- **Date direction matters.** Moving the date *earlier* (good news) updates `expectedAt` silently — no event, no email. Only later moves and clears produce a notice. Tests assert both directions.
- **`promisedAt` chaining.** After successive date moves, each new notice records the *previous* `expectedAt` as its `promisedAt`, forming an audit trail. The test asserts the second event's `promisedAt` equals the first event's `expectedAt`.
- **Time-relative helpers.** `inDays()` computes from `Date.now()`, so assertions use relative comparisons (`toBeGreaterThan`) rather than fixed timestamps to avoid flakiness across runs.
