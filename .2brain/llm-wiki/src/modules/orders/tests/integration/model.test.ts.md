---
source: src/modules/orders/tests/integration/model.test.ts
sha256: 6e2ce9a564b86b91b0b1acbecae2f44e9a55cb600e068e56bd1193e8909c7844
generated_at: 2026-11-14T20:52:25.894603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration tests that verify the order serialization contract across both Mongoose `toJSON` paths and raw `.aggregate()` output: internal fields (`_id`, `__v`) must never appear in wire-shaped results, embedded product snapshots must be normalized the same way, and order-line subdocs must not carry their own `_id`. Also guards against a schema-level pitfall (index smuggling from the embedded product schema) and pins the `transferInstructions` absence rule for legacy bank-transfer orders.

## Key elements

- **`describe('order serialization')`** — three tests:
  - *toJSON test*: calls `order.toJSON()` on a hydrated doc; asserts `id` is present, `__v` is absent (checked via `JSON.stringify`), items have no `_id`, and the embedded product is normalized.
  - *Aggregate test*: calls `orderService.search()`; casts the first result with `asStub` and asserts the same invariants on the plain-JS shape.
  - *Scoped `getById` test*: calls `orderService.getById(id, { userId })`; asserts the return is a real Mongoose document (has `toJSON`), not a pre-normalized wire object.
- **`describe('transferInstructions')`** — verifies a pending `bank_transfer` order with no `transferReference` yields `transferInstructions: undefined` (no fallback to the raw id).
- **`describe('embedded product snapshot indexes')`** — inspects `orderSchema.indexes()` directly and asserts no index path contains `product`, preventing silent index creation on the orders collection from the nested schema.

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderSchema` to read its index list for the smuggling guard.
- **`src/modules/orders/services/index.ts`** — imports `orderService` to exercise `search()` (aggregate path) and `getById()` (hydrated path).
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder` and `toOrderItem` to seed fixture data.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for the embedded-snapshot fixture.
- **`src/modules/users/tests/factories.ts`** — imports `createUser` to satisfy the order's `user` reference.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`; called once at module top level to prepare the in-memory DB before any test runs.
- **`tests/support/stub.ts`** — imports `asStub` to type-cast aggregate results (plain objects) so properties can be inspected in the serialization test.

## Notes

- `setupTestDb()` is invoked at **module scope** (outside any `describe`/`beforeAll`), so it runs during import; Jest's single worker per file keeps this safe, but it means the DB is ready before the first `it` block is even discovered.
- The `__v` assertion uses `JSON.stringify(json)).not.toContain('__v')` rather than a direct `toBeUndefined` check, which catches both `undefined` and `0` values.
- The index-smuggling test is a **schema fact guard**, not a behavioral test: it fails if someone later adds an `.index()` call to `orderLineProductSchema` without also adding `excludeIndexes` at the embed site in `orderSchema`.
- `asStub` is a zero-cost type cast (no runtime wrapper); it exists solely to satisfy TypeScript when inspecting raw aggregate output.
