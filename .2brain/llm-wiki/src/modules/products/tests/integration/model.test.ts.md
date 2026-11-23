---
source: src/modules/products/tests/integration/model.test.ts
source_sha256: baaeaedda5281d0b6caf20d5a944eca81774843f113eb399e1ffba807a325623
context_sha256: d63bc672758ca44041e32bd9d2a9dd1858cb74ea7ebd36cc26e6b85cbb1d5dcd
generated_at: 2026-11-22T07:16:44.448223+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/model.test.ts

## Purpose
Integration test guarding the product serialization contract: products must never expose `_id` or `__v` on any response path. It covers both a hydrated document (`toJSON`) and `.lean()` list results, which bypass `toJSON` and are instead mapped manually via `applyProductTransform`.

## Key elements
- `setupTestDb()` — called at module level to provision the test database for the suite.
- `describe('product serialization')` with three tests:
  - **hydrated document via `toJSON`** — creates a product with `createProduct`, then asserts `json.id` equals `_id.toString()` and the serialized JSON contains neither `_id` nor `__v`.
  - **single lookup via `productService.getById`** — asserts the result (already the wire shape, since `getById` calls `.toJSON()` itself before resolving a translation) matches `{ id, title }` and contains no `_id`/`__v`.
  - **lean list via `productService.search`** — asserts one item is returned, `id` is a 24-char hex string, and `_id`/`__v` are checked with `toBeUndefined`.

## Relationships
- `src/modules/products/services/index.ts` — exports `productService`, whose `getById`, `search` and `callerScope` are the code under test.
- `src/modules/products/tests/factories.ts` — `createProduct` seeds the products.
- `tests/support/callers.ts` — `callerAs('admin')` supplies the caller passed to `callerScope`.
- `tests/support/setup-test-db.ts` — `setupTestDb` sets up the test DB.
- `tests/support/stub.ts` — `asStub` casts `items[0]` to `Record<string, unknown>` for property checks.

## Notes
- Service calls use an admin caller scope, and products are created with `active: true` where visibility matters.
- `getById` needs no extra transform call in the test because it already returns the serialized shape.
- The `search` test expects exactly one item, so it relies on the DB being clean per test, which `setupTestDb` is presumably responsible for.
