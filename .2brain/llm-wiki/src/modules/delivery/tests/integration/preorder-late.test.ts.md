---
source: src/modules/delivery/tests/integration/preorder-late.test.ts
sha256: 0f3965ffe74266356b78a89485ea79f9a35970fcf4ba6fc83207da69849e490a
generated_at: 2026-10-29T03:47:23.131224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-late.test.ts

## Purpose

Integration test for the "preorder date slips" scenario (PRODUCT_STATES P5): an admin moves a paid preorder's release date and the delivery module notifies the buyer. Verifies that the shop only informs—never asks, cancels, or requires buyer action—and that the notice, the fulfillment-order state mutation, and the emitted event land atomically, with email following via the outbox. Uses real Mongo and the real outbox; the mailer is mocked at its queue boundary.

## Key elements

- **`preorder(days, quantity)`** — Factory helper: creates a paid preorder and its fulfillment orders (simulating the paid-listener side effect).
- **`moveDate(productId, to)`** — Simulates an admin changing a product's `releaseDate` via `productService.updateById`, then calls `settleOutboxNudges` to flush the outbox.
- **`waitingOf(orderId)`** / **`statusOf`** / **`promisedAtOf`** / **`expectedAtOf`** — Accessors for the single `awaiting_stock` fulfillment order on an order.
- **`delayedEvents()`** — Reads `fulfillment_order.delayed` events from the outbox collection in insertion order.
- **`viewsOf(orderId, userId)`** — Fetches the buyer API view, export presenter output, and board presenter output for the waiting fulfillment order.
- **`describe('a release date that moves')`** — Main suite: later dates, cleared dates, multiple moves, earlier dates (silent), multi-product groups, idempotent redelivery, and non-waiting orders.
- **`describe('what the buyer, the export and the board see of a late preorder')`** — Asserts that all three presenter views carry the new date and last-notice timestamp without introducing any buyer-action field.
- **`beforeEach` / `afterEach`** — Wires `deliveryModule.subscribe()` and `markDomainEventsWired()`; resets domain events and mocks after each test.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the sole external side-effect; mocked via `jest.mock` so the test asserts *that* email was enqueued without exercising SMTP.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` processes outbox entries after each domain action; `outboxEventModel` is queried directly to assert emitted event payloads.
- **`src/kernel/events.ts`** — `markDomainEventsWired` / `resetDomainEvents` manage the in-memory event-bus lifecycle per test.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` registers the delivery domain-event handlers so that product date-change events reach the delivery service.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.onDateChanged` is called directly to test idempotent redelivery; `deliveryService.listFulfillmentOrdersForOrder` powers the buyer-view assertion.
- **`src/modules/delivery/presenter.ts`** — `presentExportFulfillmentOrder` and `presentPreorderFulfillmentOrder` produce the export and board views asserted in the "what the buyer sees" suite.
- **`src/modules/delivery/tests/factories.ts`** — `paidPreorderOrder` and `fulfillmentOrdersOf` build the pre-condition data.
- **`src/modules/products/index.ts`** — `productService.updateById` is the "admin moves the date" entry point.
- **`tests/support/callers.ts`** — `testCallerContext` (admin) and `asCustomer` (buyer) supply auth context for service calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions a real MongoDB instance for the integration test.

## Notes

- The mailer mock is at the **queue** level (`enqueueEmail`), not at a transport level—assertions check call count and that the outbox was settled, not email body.
- `settleOutboxNudges` must be awaited after every domain action that enqueues work; forgetting it leaves the outbox unprocessed and subsequent assertions will fail silently.
- An earlier release date (a "good news" move) must produce **zero** delayed events and **zero** email calls; this is a deliberate invariant, not an oversight.
- A date that is set to `null` (cleared) *does* notify the buyer, but a date set *after* a cleared one is treated as silence (the buyer holds no promised date to update).
- Redelivery of the same move (e.g., a duplicate event) must be idempotent: exactly one event, one email.
- The test file imports `timelineOf` from `src/modules/orders/tests/factories`—used in the truncated portion for timeline assertions.
