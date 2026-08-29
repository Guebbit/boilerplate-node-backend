# src/modules/orders/tests/integration/model.test.ts

## Purpose

Integration tests that guarantee order serialization never leaks Mongoose internals (`_id`, `__v`) across every response path — hydrated documents (`toJSON`), `.aggregate()` results (mapped via `applyOrderTransform`), and scoped lookups — and that embedded product snapshots are normalized the same way. Also asserts that `productSchema` indexes do not bleed into the order collection via Mongoose's nested-schema index inheritance.

## Key elements

- **`describe('order serialization')`** — four tests covering:
  - Hydrated document via `order.toJSON()` (top-level `id` present, `__v` absent, item `_id` absent, embedded product `id` present / `_id` absent).
  - `orderService.search()` aggregate output (raw hex `id`, no `_id`, item and embedded-product `_id` absent).
  - `orderService.search({})` aggregate output (redundant shape check on `id`/`_id`).
  - `orderService.getById(id, { userId })` scoped aggregate (raw `id` matches expected, `_id` absent).
- **`describe('embedded product snapshot indexes')`** — single test that reads `orderSchema.indexes()` and asserts no index path contains `product`, catching the case where Mongoose copies `productSchema` indexes onto `orderItemSchema`'s embedded `product` field.
- **`asStub<Record<string, unknown>>(…)`** — cast helper used to inspect the actual runtime shape of service results rather than relying on the TypeScript return type.

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderSchema` solely to inspect its `.indexes()` in the snapshot-index test.
- **`src/modules/orders/service.ts`** — imports the namespace to exercise `search()` and `getById()` and verify their serialized output.
- **`src/modules/orders/tests/factory.ts`** — provides `createOrder` and `toOrderItem` for fixture setup.
- **`src/modules/products/tests/factory.ts`** — provides `createProduct` for the embedded-snapshot fixture.
- **`src/modules/users/tests/factory.ts`** — provides `createUser` (orders require an owner).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds a clean in-memory DB before all tests.
- **`tests/support/stub.ts`** — `asStub` cast for raw-shape assertions.

## Notes

- Tests 2 and 3 in the serialization block share the same `it` title ("normalizes aggregate results (search) the same way") and exercise nearly identical paths (`search()` vs `search({})`); they may have been intended as a single case.
- The header comment documents *why* both `toJSON` and aggregation paths must be tested: aggregation output is plain JS and bypasses the Mongoose `toJSON` transformer entirely.
- The index test intentionally lives here (module-specific schema fact) rather than in a generic cross-model index suite.
- `orderItemSchema` sets `_id: false` by design — the OpenAPI contract for `OrderItem` is only `{ product, quantity }`.
