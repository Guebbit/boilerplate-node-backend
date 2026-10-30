---
source: src/modules/orders/tests/integration/service-search.test.ts
sha256: ac18b521370674dcd5db06fb125efb3e99c88a6ac14a6a292be114bfb5611aa7
generated_at: 2026-10-29T04:57:09.705330+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search`, covering filtering, pagination, the three derived totals (`totalItems` / `totalQuantity` / `totalPrice`), live image resolution on order line items, and the "awaiting bank transfer" admin view. Exists to lock down the read path that `service-crud.test.ts` (the write half) does not touch.

## Key elements

- **`describe('orderService.search — derived totals')`** — four tests asserting that `totalItems`, `totalQuantity`, and `totalPrice` appear on every search result, including a multi-product order that exercises all three at once.
- **`describe('orderService.search')`** — the main block: default pagination, filters by `userId`, `email` (exact + case-insensitive), `paymentMethod` + `status`, `id[]`, `productId` (embedded), explicit `page`/`pageSize`, a raw-Mongoose `scope` object, and the empty-result shape (`items: []`, `meta.totalItems: 0`).
- **`describe('orderService.search — current (live) image')`** — four tests verifying that `items[].current.imageUrl` is resolved live from the catalogue product: unchanged, replaced-after-purchase, never-set, and hard-deleted (field absent).
- **`describe('orderService.search — the Awaiting-transfer view')`** — ordering of pending `bank_transfer` orders by `payBy` ascending (content truncated in source).
- **Top-level `setupTestDb()`** call — ensures a clean database per test run.

## Relationships

- **`@modules/orders/services/index.ts`** — imports `orderService`, the unit under test; every assertion in this file calls `orderService.search(…)`.
- **`@modules/orders/tests/factories.ts`** — supplies `createOrder`, `toOrderItem` (builds order documents), and `orderRepository` (imported; likely used in truncated sections).
- **`@modules/products/tests/factories.ts`** — supplies `createProduct`, `saveProduct`, `deleteProduct` to set up and mutate catalogue rows for the live-image tests.
- **`@modules/users/tests/factories.ts`** — supplies `createUser` for seeding order owners.
- **`@tests/setup-test-db`** — called once at module scope to reset the test database.
- **`src/modules/orders/repository.ts`** — not imported directly, but the comments note that its `normalize` step is the sole source of the three derived totals; these tests implicitly guard that step.

## Notes

- The derived totals are **never stored** on the order document. They exist only because the repository's aggregate pipeline computes them and its `normalize` step attaches them to the result. If you change the pipeline or `normalize`, this file is the guard.
- `email` filtering is **case-insensitive** (tested with `'ALICE@Example.com'`).
- The `scope` second argument to `search` is a **raw Mongoose filter** merged into the `$match` stage — it is not part of the public query schema.
- `current` on an order line is resolved **live** from the product collection at read time; the order document itself stores no image. A hard-deleted product yields `current === undefined`, not an empty object.
- `orderRepository` is imported from the orders test factories but is not visibly used in the portion of the file shown; it may be exercised in the truncated "Awaiting-transfer" block or a later section.
