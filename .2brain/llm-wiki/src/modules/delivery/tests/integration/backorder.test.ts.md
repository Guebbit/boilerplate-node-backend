---
source: src/modules/delivery/tests/integration/backorder.test.ts
sha256: c375414179dcb6944b2011c74cf3f0aaf5c16e4b0ecc8e288e594fbf713576ef
generated_at: 2026-10-29T03:45:39.869558+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/backorder.test.ts

## Purpose
Integration test covering the **paid backorder** lifecycle through the delivery module: the grouping rule (shelf ships immediately, owed part goes `on_hold`), the daily sweep that notifies buyers at their promised date, stock arrival releasing the hold, and restock-date changes triggering (or suppressing) buyer notifications. Uses a real database and real outbox; only the mailer is mocked.

## Key elements
- **`inDays(days)`** — helper returning a `Date` offset from now by the given number of days.
- **`moveRestockDate(productId, to)`** — updates a product's `restockDate` via `productService.updateById`, then settles outbox nudges to let side-effects propagate.
- **`waitingOf(orderId)`** — retrieves the single fulfillment order with `holdReason === 'awaiting_stock'` for a given order.
- **`delayedEvents()`** — queries the outbox model for `fulfillment_order.delayed` events and returns their payloads in insertion order.
- **`describe('grouping a paid backorder')`** — three tests: split into `open` + `on_hold`, 30-day default marking (`defaulted: true`), and no hold when shelf covers the full quantity.
- **`describe('the daily sweep')`** — one test asserting `runPreorderSweep` fires the notification only at the 30-day boundary, not before.
- **`describe('stock arriving for a paid backorder')`** — one test: `inventoryService.receive` + settle outbox releases the held fulfillment order to `open`.
- **`describe('a restock date that moves')`** — four tests covering date pushed later, date cleared, 30-day-default immunity to catalogue changes, and separation from pre-order (`releaseDate`) events.
- **`jest.mock` on `@infrastructure/adapters/mailer`** — replaces `enqueueEmail` with a `jest.fn()` so no real emails are enqueued.

## Relationships
- **`src/modules/delivery/tests/factories.ts`** — provides `paidBackorderOrder` (creates the paid order + frozen inventory) and `fulfillmentOrdersOf` (reads fulfillment orders back).
- **`src/modules/delivery/services/index.ts`** — `deliveryService.runPreorderSweep` is the system under test for the daily-sweep scenario.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` wires domain-event handlers in `beforeEach` so outbox events are written.
- **`src/modules/inventory/services/index.ts`** — `inventoryService.receive` simulates stock arriving to trigger the release path.
- **`src/modules/products/services/index.ts`** — `productService.updateById` changes `restockDate`/`releaseDate` to drive the date-move scenarios.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox writes; `outboxEventModel` is queried directly to assert emitted events.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `markDomainEventsWired` manage the in-memory event-bus wiring per test.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; the sole external side-effect boundary.
- **`tests/support/setup-test-db.ts`** — initialises the test database (called once at module scope).
- **`tests/support/callers.ts`** — supplies `testCallerContext` for admin-actor service calls.

## Notes
- The mailer is mocked at the **queue** level (`enqueueEmail`), not at an HTTP transport, per the file's own doc comment. Everything else (inventory, outbox, products) runs against the real test DB.
- The 30-day default is identified by `defaulted: true` on the fulfillment order; buyers in that state are explicitly immune to restock-date moves (no `delayed` event, no email).
- `delayedEvents()` reads directly from the Mongoose model rather than going through a service, giving the test a stable assertion surface for outbox payloads.
- `setupTestDb()` runs once at module load; `beforeEach` handles per-test event-bus re-wiring and mock clearing.
- The `inDays` helper uses millisecond arithmetic; the sweep boundary test relies on this (28.5 days ≠ due, 29.5 days = due).
