---
source: src/modules/orders/tests/integration/order-number-filter.test.ts
sha256: 6cc943152076d82448bd743cac9d1b9a4c7a6a36e812bb9e0ed87add576590c5
generated_at: 2026-10-29T04:54:18.721442+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number-filter.test.ts

## Purpose

Integration test (real Mongo) that verifies the `orderNumber` filter on order list/search and CSV export. It confirms the filter tolerates common customer typing variants (leading `#`, extra whitespace, truncated serial digits), returns an empty page rather than an error for inputs that cannot be a valid order number, respects the caller's read scope so a buyer cannot retrieve another buyer's order, and that the unique index on `orderNumber` rejects duplicate inserts.

## Key elements

- **`orderNumbered(orderNumber, email)`** — local helper: creates a user, a product, and an order carrying the given `orderNumber`; returns `{ user, id }` for later assertions.
- **`found(orderNumber)`** — local helper: calls `orderService.search({ orderNumber }, {})` and maps results to an array of order IDs.
- **`describe('the orderNumber filter')`** — five test cases:
  - Parametric tolerance (`it.each`): `1999-000041`, `#1999-000041`, ` 1999-41 `, `#1999-41` all resolve to the same order.
  - Empty-page guarantee for `nonsense`, `41`, `1999-`, `#`.
  - No match for a well-formed but unheld number (`1999-99`).
  - Scope isolation: a customer searching by number only sees their own order.
  - CSV export narrowing via `orderService.openOrderExport` + `text(stream)`.
- **`describe('the unique index')`** — single test: after `orderModel.init()`, a second insert with the same number rejects with Mongo error code `11000`.

## Relationships

- **`src/modules/orders/services/index.ts`** — imports `orderService`; calls `orderService.search`, `orderService.callerScope`, and `orderService.openOrderExport`.
- **`src/modules/orders/model.ts`** — imports `orderModel`; calls `orderModel.init()` to ensure the unique index is present before the duplicate-insert test.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder` and `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct`.
- **`src/modules/users/tests/factories.ts`** — imports `createUser`.
- **`tests/support/callers.ts`** — imports `asAdmin`, `asCustomer`, `callerContextAs` to build caller scopes for scoping and CSV-export tests.
- **`tests/support/setup-test-db.ts`** — imports and calls `setupTestDb()` at module top-level to point the test at a real MongoDB instance.

## Notes

- The unique-index test explicitly calls `orderModel.init()`; without it the index may not yet exist on the test database, so the duplicate insert would succeed silently.
- The CSV-export test uses `node:stream/consumers` `text()` to read the streamed CSV to a string, then asserts on substring presence/absence.
- The export test treats a `'success'` result as a failure (`throw new Error('export refused')`)—the expected code path is the stream-based (non-success) return.
- Order-number tolerance is exercised purely through the service layer; the underlying normalization logic lives in `orderService.search` / the model query builder, not in this test.
