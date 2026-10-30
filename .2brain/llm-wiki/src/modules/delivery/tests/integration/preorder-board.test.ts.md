---
source: src/modules/delivery/tests/integration/preorder-board.test.ts
sha256: 76c081ddc8d84a9767646e8105c953495a4f30194c28da8e5671b5f0466b06b0
generated_at: 2026-10-29T03:47:02.794716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-board.test.ts

## Purpose

Integration test suite that verifies the preorder board's read paths against fulfillment orders in every lifecycle state. It asserts that the Mongo query conditions used by `listPreorderFulfillmentOrders` and the `boardStateOf` helper agree on which rows belong to which state, validates the Late view and due-soon warning, checks that the product summary arithmetic is consistent, and enforces row-level visibility (buyer vs. admin vs. anonymous).

## Key elements

- **`placed(quantity, days, buyer?)`** – Creates one paid preorder order (via `paidPreorderOrder`) and its fulfillment orders; returns the order.
- **`arrive(productId, quantity)`** – Calls `inventoryService.receive` then `settleOutboxNudges` so the allocation propagates to delivery.
- **`board(query?, now?)`** – Thin wrapper around `deliveryService.listPreorderFulfillmentOrders` as admin; returns only `items`.
- **`orderIdsOf(rows)`** – Extracts and sorts order IDs for set-comparison assertions.
- **`everyState()`** – Creates six preorders (waiting, allocated, shipped, delivered, cancelled, held) so a single test can exercise every filter.
- **`describe` blocks** – State-filter agreement, Late view & due-soon warning, product summary (counts, late subset), access control (buyer / admin / anonymous), and the `cause` filter (preorder vs. backorder vs. `any`).
- **`jest.mock` for `@infrastructure/adapters/mailer`** – Stubs `enqueueEmail` to prevent side effects.
- **`inDays(days)`** – Simple date-offset helper used throughout for release-date and `now`-parameter manipulation.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` bootstraps the in-memory MongoDB for the whole suite.
- **`tests/support/callers.ts`** – Provides `asAdmin`, `asCustomer`, `callerContextAs`, and `testCallerContext` for caller-identity assertions and service calls.
- **`src/modules/delivery/services/index.ts`** – Primary SUT: `deliveryService.listPreorderFulfillmentOrders`, `.summarizePreorders`, `.cancelAllForOrder`, `.holdFulfillmentOrder`.
- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` wires the module's event handlers in `beforeEach`.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder`, `paidBackorderOrder`, `fulfillmentOrdersOf`, `shipEverything`, `deliverEverything` build the order/fulfillment fixtures.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService.receive` drives the allocation state transition.
- **`src/modules/orders/tests/factories.ts`** – `forceOrderStatus` pushes an order to `processing` before shipping.
- **`src/modules/products/index.ts` / `services/index.ts`** – `productService.updateById` changes a product's `releaseDate` to test the slipped-days calculation.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes deferred outbox entries so domain events fire.
- **`src/kernel/events.ts`** – `markDomainEventsWired` / `resetDomainEvents` manage the event-bus lifecycle per test.
- **`src/types/index.ts`** – `OrderStatus.processing` used with `forceOrderStatus`.

## Notes

- The test intentionally does **not** mock the delivery service or Mongo; it exercises the real query path so that the Mongo condition and the `boardStateOf` projection are kept in sync ("written twice, one rule").
- Time-dependent assertions (Late view, due-soon, slipped days) pass an explicit `now` date to the service rather than freezing the clock, making tests deterministic without a timer mock.
- The product-summary test includes a comment that two helper orders will never share a product ID, so the second order's product is deliberately distinct.
- `toSorted()` (non-mutating) is used for all set-comparison assertions to avoid side-effect bugs in repeated expectations.
- The `cause: 'any'` filter value is a string literal, not an enum member; tests assert it returns the union of preorder and backorder rows.
