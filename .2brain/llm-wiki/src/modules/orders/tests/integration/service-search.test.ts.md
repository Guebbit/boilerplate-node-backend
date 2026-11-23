---
source: src/modules/orders/tests/integration/service-search.test.ts
source_sha256: 6705d468367c9e3ea67b2396e4ddfb78b8066034f0de2e94359ae6ebdfe862da
context_sha256: a13cc026c7af7673edbad5327c2cc264511f5dedc8fa36902152f70d5e6401d6
generated_at: 2026-11-22T06:33:33.900608+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose
Integration tests for `orderService.search`: filtering, pagination, the derived totals (`totalItems`, `totalQuantity`, `totalPrice`), the live `current` image on order lines, and the "Awaiting-transfer" admin view. It is the read half of the orders service tests; `service-crud.test.ts` covers the write half (`create`, `update`, `remove`, …).

## Key elements
- `setupTestDb()` is called at module level to prepare the test database.
- `describe('orderService.search — derived totals')` checks that results carry computed fields. These are not stored on the document. `applyOrderTransform` derives them, and `.aggregate()` bypasses the schema's `toJSON`, so the repository's `normalize` step is the only thing that adds them.
  - `totalItems` is the number of distinct product lines.
  - `totalQuantity` is the sum of quantities.
  - `totalPrice` is the sum of price × quantity, returned as a string such as `'45.00'`.
- `describe('orderService.search')` covers the main search behaviour:
  - Default pagination, and `meta.totalItems` / `meta.totalPages` (an empty result gives 0 for both).
  - Filters: `userId`, `email` (exact match, and case-insensitive), `paymentMethod` combined with `status`, order `id` (array), and `productId` (matches the embedded product).
  - `page` / `pageSize` paging.
  - A second `scope` argument, a raw Mongoose filter merged into the `$match` stage (for example `{ userId: user1._id }`).
- `describe('orderService.search — current (live) image')` checks that `items[0].items[0].current` is resolved from the catalogue product on every read:
  - Unchanged product: `{ imageUrl }`.
  - Image replaced after purchase: the new `imageUrl`.
  - Product that never had an image: `{}`.
  - Product hard-deleted: `current` is left out (asserted with `toBeUndefined`).
- `describe('orderService.search — the Awaiting-transfer view')` starts with a test that lists pending bank transfers by nearest `payBy`, soonest first. It creates orders with `paymentMethod` and `payBy` values.

## Relationships
- `src/modules/orders/services/index.ts`: supplies `orderService`, the unit under test.
- `src/modules/orders/tests/factories.ts`: supplies `createOrder`, `toOrderItem` and `orderRepository`.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`, `saveProduct` and `deleteProduct`. The last two are used to change or remove a product after an order exists.
- `src/modules/users/tests/factories.ts`: supplies `createUser`.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`, imported through the `@tests` alias.
- `src/modules/orders/repository.ts`: not imported directly. Its `normalize` step is what the derived-totals tests exercise.

## Notes
- Order lines store no image, so the `current` image tests rely on a live lookup against the product. Replacing or deleting the product changes the result without touching the order.
- `orderRepository` is imported, but the visible part of the file does not use it.
- Tests that need several users pass distinct `email` and `username` values to `createUser`.
