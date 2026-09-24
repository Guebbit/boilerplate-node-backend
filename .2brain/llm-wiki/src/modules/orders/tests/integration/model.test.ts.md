---
source: src/modules/orders/tests/integration/model.test.ts
sha256: c4d1303b8f4c656243b8b17be85d1a7c6f07611da1c73cc64e1ecc8ff4a92010
generated_at: 2026-09-23T19:10:56.443858+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration test suite that guards the order serialization contract: `_id` and `__v` must never appear in any response shape (Mongoose `toJSON`, `.aggregate()` results, scoped lookups), embedded product snapshots must be normalized the same way, order items must carry no `_id`, `transferInstructions` must not be fabricated for legacy orders, and product-schema indexes must not leak into the order schema.

## Key elements

- **`describe('order serialization')`** — four tests covering `toJSON` on a hydrated doc, `orderService.search()` (no-arg), `orderService.search({})`, and `orderService.getById(id, { userId })`. Each asserts `id` is present, `_id`/`__v` are absent, and embedded items/product snapshots follow the same rules.
- **`describe('transferInstructions')`** — asserts that a `bank_transfer` order lacking a `transferReference` yields `undefined` (not a fallback to the raw id).
- **`describe('embedded product snapshot indexes')`** — inspects `orderSchema.indexes()` directly and asserts no index path contains `product`, preventing silent index creation from a nested schema.

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderSchema` to enumerate its indexes in the index-leak test.
- **`src/modules/orders/services/index.ts`** — imports `orderService` and calls `search()` / `getById()` to exercise the aggregate code path.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder` and `toOrderItem` to seed realistic data.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` for the embedded snapshot.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (orders are user-scoped).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a real MongoDB instance.
- **`tests/support/stub.ts`** — `asStub<T>()` casts service return types so tests can assert on raw runtime shape without the wrapper typing.

## Notes

- Two tests in the serialization block share the identical name `'normalizes aggregate results (search) the same way'`; they differ in that one calls `search()` and the other `search({})`. If one is removed, the other still covers the same assertion.
- The doc comment at the top explains *why* `applyOrderTransform` is needed for aggregate output (plain JS objects bypass `toJSON`, same as `.lean()`). This is context for anyone modifying the transform.
- The index-leak test is a *guard* against future changes to `orderLineProductSchema`, not a regression test for current behavior — it will pass trivially today.
- `asStub` is used instead of destructuring or type-narrowing because the service likely returns a wrapper/Result type; the test needs the raw object to inspect for `_id`/`__v`.
