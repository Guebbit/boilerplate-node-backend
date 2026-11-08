---
source: src/modules/delivery/tests/integration/backorder.test.ts
sha256: 7ee53a26ae7c4d46f08d73f7464213f1f7cfb570a9d245ed098f2865ef18dc45
generated_at: 2026-11-08T05:41:43.469765+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/backorder.test.ts

## Purpose

Integration test that exercises the full paid-backorder lifecycle through the delivery module: grouping a split into a shippable shelf line and an `on_hold` owed line, the daily preorder sweep that notifies buyers when a 30-day default promise is due, stock arrival that releases held lines, and restock-date changes that update or clear a buyer's expected date. Only the mailer is mocked; inventory, outbox, products, and shop run for real against a test database.

## Key elements

- **`paidBackorderOrder` / `fulfillmentOrdersOf`** (from `@modules/delivery/tests/factories`) — create a paid order with a split shelf/owed quantity and fetch its fulfillment orders.
- **`moveRestockDate`** — admin-side action: updates a product's `restockDate` via `productService.updateById` then calls `settleOutboxNudges` so the outbox processes the resulting event.
- **`waitingOf`** — pulls the single fulfillment order whose `holdReason` is `'awaiting_stock'` for a given order.
- **`delayedEvents`** — reads all `fulfillment_order.delayed` entries from `outboxEventModel` (sorted by `_id`) and returns their payloads.
- **`inDays`** — simple date offset helper (86 400 000 ms per day).
- **Four `describe` blocks** — grouping, daily sweep, stock arrival, restock-date changes.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a `jest.fn`; the only mock in the file.

## Relationships

- **`@infrastructure/adapters/mailer`** — mocked; `enqueueEmail` is asserted on (e.g., "not called" for default-promise buyers).
- **`@kernel/outbox`** — `settleOutboxNudges` flushes queued outbox work so side-effects (status changes, event emission) complete; `outboxEventModel` is queried directly for `fulfillment_order.delayed` assertions.
- **`@kernel/events`** — `markDomainEventsWired` (afterEach resets with `resetDomainEvents`) connects module subscriptions to the event bus for each test.
- **`@modules/delivery/module`** — `deliveryModule.subscribe()` registers the module's domain-event handlers in `beforeEach`.
- **`@modules/delivery/services`** — `deliveryService.runPreorderSweep` drives the daily sweep test.
- **`@modules/inventory`** — `inventoryService.receive` simulates stock arriving, which triggers release of the held line.
- **`@modules/products`** — `productService.updateById` changes `restockDate` / `releaseDate` to drive the "moved date" scenarios.
- **`@modules/shop`** — `shopDayOf` converts a `Date` to the shop's day-of representation before persisting.
- **`@tests/setup-test-db`** / **`@tests/callers`** — test-DB bootstrap and the standard caller context passed to service calls.

## Notes

- `settleOutboxNudges` must be awaited **after** any action that enqueues outbox events (stock receive, restock-date update) before asserting on fulfillment-order status or outbox contents; forgetting it leaves state in a half-processed state.
- The 30-day default promise is special: it is flagged `defaulted: true`, and no restock-date change (later, earlier, or cleared) may alter its `expectedAt` or emit a `delayed` event. The test explicitly guards this with two `moveRestockDate` calls and a "no mail" assertion.
- The sweep boundary test uses fractional days (28.5 vs 29.5) to confirm the trigger sits at ≈ 30 days, not 28 or 29.
- `waitingOf` uses a non-null assertion (`!`), so it will throw rather than return `undefined` if no `awaiting_stock` line exists — a precondition the tests rely on.
- The "release date vs restock date" cross-test confirms that changing a product's `releaseDate` does **not** notify backorder buyers (and vice-versa is implied by the other tests).
