# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration tests that verify a single invariant: product responses must never expose Mongoose internals (`_id`, `__v`) on any serialization path — both hydrated documents (via `toJSON`) and `.lean()` list results (mapped manually by the service).

## Key elements

- **`describe('product serialization')`** — top-level suite containing three cases, each targeting a different response path.
- **Test: "normalizes a hydrated document via toJSON"** — creates a product, calls `product.toJSON()`, asserts `id` is a string form of `_id` and that neither `_id` nor `__v` appear in the JSON.
- **Test: "normalizes a single lookup via productService.getById (no .lean())"** — exercises the single-fetch path through the service, asserts the returned document's `toJSON()` shape.
- **Test: "normalizes a lean list via productService.search"** — exercises the list path (`.lean()`), casts the plain object with `asStub`, asserts `id` matches a 24-char hex pattern and that `_id`/`__v` are `undefined`.

## Relationships

- **`src/modules/products/service.ts`** — imports `getById`, `search`, and `callerScope`; the tests call these service functions to verify serialization at the boundary the API actually uses.
- **`src/modules/products/tests/factory.ts`** — imports `createProduct` to seed known product documents before each assertion.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module scope to provision a clean in-memory test database before the suite runs.
- **`tests/support/stub.ts`** — imports `asStub` to cast `.lean()` plain objects (which lack Mongoose document typings) so property access can be asserted in TypeScript.

## Notes

- The file's header comment documents *why* two distinct code paths are tested: `.lean()` returns raw objects that bypass `toJSON`, so the service must apply its own transform (`applyProductTransform`). The third test exists specifically to guard that manual mapping.
- `callerScope({ admin: true })` is passed to every service call; the tests do not exercise non-admin scopes.
- The `id` field is expected to be the hex string of the original `_id` (24 lowercase hex chars), not an ObjectId instance.
