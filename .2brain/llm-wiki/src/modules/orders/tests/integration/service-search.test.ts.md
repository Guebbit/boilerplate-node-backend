---
source: src/modules/orders/tests/integration/service-search.test.ts
sha256: 5e50d0d8721a982ddb9bc9b2c0ffe288f3b635cd55f8f3fb6ef14865fb00b2d5
generated_at: 2026-11-08T07:10:03.616541+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search`, verifying filtering, pagination, the three aggregate-derived totals, live image resolution on order line items, and the admin "awaiting transfer" view. Complements `service-crud.test.ts` (write path) by covering the full read pipeline end-to-end against a real database.

## Key elements

- **`describe('orderService.search — derived totals')`** — Four cases asserting that `totalItems` (distinct product lines), `totalQuantity` (sum of quantities), and `totalPrice` (sum of price × qty) appear on every search result and are computed correctly for single- and multi-product orders.
- **`describe('orderService.search')`** — The main block. Covers: default pagination, filtering by `userId`, `email` (exact + case-insensitive), `paymentMethod` + `status` combo, `id` (array), embedded `productId`, explicit `page`/`pageSize`, the `scope` parameter (raw Mongoose `$match` merge), and the empty-result case.
- **`describe('orderService.search — current (live) image')`** — Four cases for the `current` field on each order item: unchanged product, replaced image after purchase, product with no image (empty object), and hard-deleted product (`undefined`).
- **`describe('orderService.search — the Awaiting-transfer view')`** — Verifies that pending `bank_transfer` orders are returned sorted by `payBy` ascending, with non-matching payment methods excluded.
- **`setupTestDb()`** — Called at module top-level to provision/tear down the test database.

## Relationships

- **`src/modules/orders/services/index.ts`** — Source of `orderService`, the unit under test in every assertion.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `toOrderItem`, and `orderRepository` used to seed and inspect data.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct`, `saveProduct`, `deleteProduct` for catalogue fixtures and the live-image mutation/delete scenarios.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` for user fixtures (email, id) used in filtering tests.
- **`tests/support/setup-test-db.ts`** — Imports and invokes `setupTestDb()` for DB lifecycle.
- **`src/modules/orders/repository.ts`** — Not imported directly, but the tests implicitly exercise its `normalize` step and `applyOrderTransform` (aggregate pipeline) that produce the derived totals and the `current` image join.

## Notes

- `totalPrice` is asserted as a **string** (e.g. `'45.00'`), not a number — the aggregate pipeline formats it.
- Email filter is case-insensitive (`'ALICE@Example.com'` matches `'alice@example.com'`).
- The `scope` argument (second param to `search`) is a raw Mongoose filter object merged into `$match`; it is not part of the public query-options type.
- When a product is hard-deleted, `current` is `undefined` (key absent), whereas a product with no image yields `{}`. These are distinct assertions.
- The file's module doc-comment explicitly scopes this to the read path; write-path coverage lives in `service-crud.test.ts`.
