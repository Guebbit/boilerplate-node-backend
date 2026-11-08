---
source: src/modules/delivery/tests/integration/preorder-board.test.ts
sha256: c22f76f857723c7e5b4b17eb2b9be5ee62990f491881229227d8eaee7b34e94a
generated_at: 2026-11-08T05:43:16.230818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-board.test.ts

## Purpose

Integration tests for the preorder board's read surface (`listPreorderFulfillmentOrders` and `summarizePreorders`). The file verifies that each state filter returns exactly the rows whose own `state` field says so (keeping the Mongo query and `boardStateOf` in lockstep), exercises the Late view and due-soon warning, confirms the product summary arithmetic, checks buyer/admin/anon access control, and distinguishes preorder from backorder causes.

## Key elements

- **`placed(quantity, days, buyer?)`** – Creates a paid preorder order for one product with a future release date, then materialises its fulfilment orders.
- **`arrive(productId, quantity)`** – Receives inventory and settles outbox nudges so the allocation reaches the delivery module.
- **`board(query?, now?)`** – Shorthand that calls `deliveryService.listPreorderFulfillmentOrders` as admin and returns the `items` array.
- **`orderIdsOf(rows)`** – Extracts a sorted array of `orderId`s for set-comparison.
- **`everyState()`** – Creates one order per board state (waiting, allocated, shipped, delivered, canceled, held), each for a distinct buyer.
- **`inDays(days)`** – Returns a `Date` offset from now by the given whole days.
- **`setupTestDb()`** – Called once at module level to prepare the in-memory DB.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – Stubs `enqueueEmail` so no mail is sent during tests.

Test groups (top-level `describe` blocks):

| Group | What it pins down |
|---|---|
| *every state filter…* | Each of the four filterable states returns the exact matching subset; `delivered` flag distinguishes in-transit vs. arrived shipments. |
| *the Late view and the due-soon warning* | `late: true` with a shifted `now`, `dueWithin` window, and `slippedDays` calculation after a releaseDate change. |
| *the product summary* | Unit counts per state sum to `paid`; late units are a subset of waiting. |
| *who may read which rows* | Buyer sees own orders only; admin sees all; no-session caller sees none. |
| *the cause filter* | `preorder` / `backorder` / `any` select the correct subset. |

## Relationships

- **`src/modules/delivery/services/index.ts`** – The system under test; all assertions target `deliveryService.listPreorderFulfillmentOrders`, `.summarizePreorders`, `.cancelAllForOrder`, and `.holdFulfillmentOrder`.
- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` is called in `beforeEach` so domain-event handlers are active.
- **`src/modules/delivery/tests/factories.ts`** – Provides `paidPreorderOrder`, `paidBackorderOrder`, `fulfillmentOrdersOf`, `shipEverything`, `deliverEverything` used to drive orders through each state.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService.receive` is called to trigger allocation.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes the outbox so side-effects of `receive` complete synchronously.
- **`src/kernel/events.ts`** – `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle around each test.
- **`src/modules/orders/tests/factories.ts`** – `forceOrderStatus` pushes an order to `OrderStatus.processing` so shipping/delivery can proceed.
- **`src/modules/products/services/index.ts`** – `productService.updateById` changes a product's `releaseDate` to exercise the slip calculation.
- **`src/modules/shop/index.ts`** – `shopDayOf` converts a `Date` into the shop's day representation for the releaseDate update.
- **`src/types/index.ts`** – `OrderStatus.processing` is used to transition orders forward.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `callerContextAs`, `testCallerContext` supply the caller/permission context for every service call.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the test database.

## Notes

- The state-filter test intentionally checks only four of the six created states (`waiting`, `allocated`, `shipped`, `canceled`). The `delivered` and `held` rows are set up but not individually filtered; `delivered` is instead verified via the `delivered` boolean flag on shipped rows.
- The `late` and `slippedDays` tests inject a future `now` date (or update `releaseDate` post-placement) to simulate elapsed time without waiting.
- The product-summary test asserts that two helper orders created via `placed` will *not* share a product ID (`expect(first.productIds[0]).not.toBe(second.productIds[0])`); the test then only inspects the first product's row.
- The "no session" access test passes `undefined` as the caller, expecting an empty result set rather than an error.
- `setupTestDb()` runs at module scope (once), while event-bus wiring and resets happen per-test in `beforeEach`/`afterEach`.
