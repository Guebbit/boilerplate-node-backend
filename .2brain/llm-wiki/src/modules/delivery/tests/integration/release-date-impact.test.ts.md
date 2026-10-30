---
source: src/modules/delivery/tests/integration/release-date-impact.test.ts
sha256: 805011349100a473ded5e77375154570426fdfaaff21d0d0324f1d04d755fb38
generated_at: 2026-10-29T03:47:53.708242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/release-date-impact.test.ts

## Purpose

Integration test that verifies the delivery module's `previewDateImpact` contract: the number of distinct orders the preview reports as "to be notified" must equal the number of `fulfillment_order.delayed` outbox events actually written after the same date change is persisted. It runs against a real MongoDB instance and a real outbox, with only the mailer adapter mocked at the `enqueueEmail` boundary.

## Key elements

- **`describe('the preview matches what the save then does')`** — Table-driven (`it.each`, 9 cases) test. For each case it: creates a preorder via `paidPreorderOrder`, optionally performs a prior `moveDate` (second-slip scenarios), snapshots the outbox, calls `previewDateImpact`, asserts the outbox is unchanged by the preview, then calls `moveDate` and asserts both the preview result and the distinct-order count of new `delayed` events match the expected value.
- **`describe('the preview')`** — Three unit-ish checks: 404 for a non-existent product (`MISSING_ID`), deduplication when one order has multiple fulfillment orders on the same product, and absence of `ask`/`answerBy` fields in the response.
- **`moveDate`** — Helper that calls `productService.updateById` to set `releaseDate` then flushes the outbox via `settleOutboxNudges`.
- **`delayedEvents` / `countOf`** — Query `outboxEventModel` for `fulfillment_order.delayed` rows; `countOf` extracts distinct `orderId`s after a given offset.
- **`preview`** — Thin wrapper around `deliveryService.previewDateImpact(productId, 'preorder', target)` that throws on failure.
- **`preorder`** — Creates a paid preorder with N release-date lines via the `paidPreorderOrder` factory, then materialises its fulfillment orders.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** — Replaces the mailer adapter with a no-op `enqueueEmail` stub so no real emails are sent.
- **`beforeEach` / `afterEach`** — Reset domain-event wiring, re-subscribe `deliveryModule`, clear all mocks.

## Relationships

- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried directly to count written `delayed` events; `settleOutboxNudges` is awaited after each product update to flush the outbox synchronously.
- **`src/kernel/events.ts`** — `resetDomainEvents` and `markDomainEventsWired` manage the in-memory event-bus lifecycle around each test.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.previewDateImpact` is the system under test.
- **`src/modules/delivery/module.ts`** — `deliveryModule.subscribe()` wires the module's event handlers so that saving a product date actually triggers the delayed-order logic.
- **`src/modules/delivery/model.ts`** — `fulfillmentOrderModel` is used to duplicate a fulfillment order (the "several fulfillment orders" test).
- **`src/modules/delivery/tests/factories.ts`** — `paidPreorderOrder` and `fulfillmentOrdersOf` create the fixture data.
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — `productService.updateById` and `findByIdRaw` are the real product service used to move the date and read it back.
- **`tests/support/setup-test-db.ts`** — Provides the real in-memory Mongo connection.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the auth/actor context for service calls.
- **`tests/support/ids.ts`** — `MISSING_ID` is a deterministic "does-not-exist" ObjectId.

## Notes

- The core invariant is "same rule on both sides": the test does **not** check a hardcoded number; it asserts `previewed === countOf(before)`. Any drift between preview logic and the actual save path is the bug being guarded.
- The `'same'` sentinel in the `it.each` table is resolved at runtime via `currentDate(productId)`; it is **not** a date arithmetic case.
- `settleOutboxNudges` must be awaited inside `moveDate` before asserting on the outbox; forgetting it makes the test flaky because outbox writes are async.
- The test intentionally exercises the **preorder** scope only (`'preorder'` is the second arg to `previewDateImpact`); other scopes are out of scope here.
