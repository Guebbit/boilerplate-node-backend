---
source: src/modules/delivery/tests/integration/release-date-impact.test.ts
sha256: 0b0b7ea71ff41a4fce2e1d90dd8e8ed9ed35c1e10abacd45fa9a63b5615b83d4
generated_at: 2026-11-08T05:44:11.792341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/release-date-impact.test.ts

## Purpose

Integration test that verifies the `deliveryService.previewDateImpact` result matches the actual side-effect of moving a product's release date. For each scenario, it asserts that the preview's `notify` count (distinct orders) equals the number of distinct orders that receive a `fulfillment_order.delayed` outbox event after the save. Uses a real MongoDB and a real outbox; the mailer adapter is mocked at the queue boundary.

## Key elements

- **`inDays(days)`** — returns a `Date` offset from now by `days` (86 400 000 ms per day).
- **`moveDate(productId, to)`** — admin action: calls `productService.updateById` with the new `releaseDate` (converted via `shopDayOf`) then `settleOutboxNudges()` to flush the outbox.
- **`delayedEvents()`** — queries `outboxEventModel` for `fulfillment_order.delayed` entries, returns an array of `{ orderId }` payloads in insertion order.
- **`countOf(before)`** — counts distinct `orderId` values in events written *after* index `before`, returning `{ notify: n }`.
- **`preview(productId, to)`** — calls `deliveryService.previewDateImpact(productId, 'preorder', to)`; throws on failure, returns the `data` on success.
- **`preorder(...dates)`** — creates a paid preorder order with one line per date via the `paidPreorderOrder` factory, then creates its fulfillment orders.
- **`currentDate(productId)`** — reads the product's current `releaseDate` or `null`.
- **`describe('the preview matches what the save then does')`** — table-driven `it.each` with 11 cases covering: later date, long slip, second slip, earlier date, next shop day, same shop day, cleared date, cleared-again, no-op (same date), group moving later, group moving earlier. Each case optionally performs a first move, then asserts preview count === actual distinct-order count.
- **`describe('the preview')`** — three focused tests: 404 for missing product; multiple fulfillment orders on the same order still count once; result contains no `ask` or `answerBy` properties.

## Relationships

- **`src/modules/delivery/services/index.ts`** — provides `deliveryService.previewDateImpact`, the function under test.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` is called in `beforeEach` to wire domain-event handlers.
- **`src/kernel/events.ts`** — `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle around each test.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to read written events; `settleOutboxNudges` triggers actual outbox processing after a date move.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel.create` is used to duplicate a fulfillment order for the multi-fulfillment-order edge case.
- **`src/modules/delivery/tests/factories.ts`** — `paidPreorderOrder` and `fulfillmentOrdersOf` build the test fixtures.
- **`src/modules/products/index.ts`** — `productService.updateById` performs the date change; `findByIdRaw` reads current state.
- **`src/modules/shop/index.ts`** — `shopDayOf` converts a `Date` to the shop's day representation stored on the product.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for service calls.
- **`tests/support/ids.ts`** — `MISSING_ID` is a valid ObjectId that no document owns (used for the 404 test).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/test MongoDB connection.

## Notes

- The mailer (`@infrastructure/adapters/mailer`) is mocked via `jest.mock` so no real email is enqueued; the outbox still records events.
- The `beforeEach` order matters: `resetDomainEvents` → `deliveryModule.subscribe()` → `markDomainEventsWired`. Skipping any step breaks event delivery.
- The `'same'` sentinel in the table row means "move to whatever the product's current date is," testing a true no-op without hard-coding the value.
- `countOf` uses `new Set(...).size` to deduplicate by order ID — multiple fulfillment orders on one order still yield a single notification count, matching the preview contract.
