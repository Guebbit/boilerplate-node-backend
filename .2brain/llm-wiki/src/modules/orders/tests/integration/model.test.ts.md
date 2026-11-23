---
source: src/modules/orders/tests/integration/model.test.ts
source_sha256: b66f46c2dc7fd391b524623b04538b9a946421eacc7377e1f62f6abfe9ccb7bb
context_sha256: 1adf209766a8d1acb5cc001e76bf0ca2b0eaf9e613179a95ed9bd711aaa9c26c
generated_at: 2026-11-22T06:29:30.446908+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose
Integration tests for the orders module's serialization and schema behavior. They check that orders never leak `_id`/`__v` on any response path (hydrated `toJSON` and `.aggregate()` results), that embedded product snapshots are normalized, and that embedded order items carry no `_id`. They also cover `transferInstructions` and an index-hygiene check on the order schema.

## Key elements
- **`order serialization`** suite:
  - `toJSON` on a hydrated order exposes `id`, omits `__v`, and strips `_id` from both items and the embedded product (which gets `id`).
  - `orderService.search()` aggregate rows are normalized the same way (24-hex `id`, no `_id` on the order, items, or embedded product).
  - A scoped `orderService.getById(id, { userId })` returns a real Mongoose document (has `toJSON`), not the aggregate wire shape.
- **`transferInstructions`** suite: a pending `bank_transfer` order with no `transferReference` has no `transferInstructions` in its JSON, so no reference is fabricated from the raw id.
- **`embedded product snapshot indexes`** suite: asserts that `orderSchema.indexes()` has no index involving `product`, so the embedded product schema's indexes are not copied onto orders.

## Relationships
- `src/modules/orders/model.ts`: `orderSchema` is inspected directly for its indexes.
- `src/modules/orders/services/index.ts`: the `orderService` it exports is exercised through `search()` and `getById()`.
- `src/modules/orders/tests/factories.ts`: `createOrder` and `toOrderItem` build the fixtures.
- `src/modules/products/tests/factories.ts` and `src/modules/users/tests/factories.ts`: `createProduct` and `createUser` supply the order's product and user.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to provide the test database.
- `tests/support/stub.ts`: `asStub` casts aggregate results to a plain record.

## Notes
- Aggregation output is plain JS and bypasses `toJSON`, like `.lean()`. The module header says it is mapped manually via `applyOrderTransform`.
- Embedded items have no `_id` because `orderItemSchema` sets `_id: false`, matching OpenAPI's `OrderItem` of `{product, quantity}`.
- The index test is placed here rather than in the generic index suite because it covers this module's schema. Per the test's comment, Mongoose copies a nested schema's indexes onto the embedding schema unless `excludeIndexes` is set at the embed site.
- The test comment says `applyTransferInstructions` no longer falls back to the raw id for orders that lack `transferReference`.
