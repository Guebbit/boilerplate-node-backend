---
source: src/modules/products/tests/integration/model.test.ts
sha256: c2540924727d9a3845d357e3cc8cef4672e6b28160acd2d2fa5c4080e6da7eca
generated_at: 2026-11-08T07:51:40.630244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration test that enforces a single invariant: product responses must never expose Mongoose-internal fields (`_id`, `__v`) regardless of the serialization path — hydrated `toJSON`, single-document lookup, or `.lean()` list results.

## Key elements

- **`setupTestDb()`** — called at module scope to initialise the in-memory test database before any test runs.
- **`describe('product serialization')`** — the test suite containing three cases:
  - *`toJSON` on a hydrated document* — creates a product via factory, calls `product.toJSON()`, asserts `id` is present and `_id`/`__v` are absent.
  - *`productService.getById`* — fetches a single product (no `.lean()`); asserts the returned wire object has `id` and no `_id`/`__v`.
  - *`productService.search`* — fetches a `.lean()` list; asserts items have a hex `id`, and `_id`/`__v` are `undefined`.
- **`asStub`** — used to cast a lean-array element to `Record<string, unknown>` so property absence can be asserted without a full product type.
- **`callerAs('admin')`** — supplies the caller-scope argument that `productService` methods require.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | Imports `productService`; calls `getById`, `search`, and `callerScope`. |
| `src/modules/products/tests/factories.ts` | Imports `createProduct` to seed documents into the test DB. |
| `tests/support/callers.ts` | Imports `callerAs` to build an admin-scoped caller object. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` to provision and reset the test database. |
| `tests/support/stub.ts` | Imports `asStub` for a type-level cast on `.lean()` array items. |

## Notes

- The file-level JSDoc makes the contract explicit: `toJSON` handles hydrated docs, while `.lean()` results are mapped manually via `applyProductTransform` (inside the service). Tests here verify the *output* of that mapping, not the mapper itself.
- `getById` already calls `.toJSON()` internally before resolving translations, so the test asserts on the final wire shape directly — there is no second transform step to invoke.
- The `search` test uses `toMatch(/^[\da-f]{24}$/)` on `item.id` rather than a strict equality check, because the lean path builds `id` from the raw `_id` value at transform time.
