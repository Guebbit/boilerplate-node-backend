---
source: src/modules/products/tests/integration/model.test.ts
sha256: c2540924727d9a3845d357e3cc8cef4672e6b28160acd2d2fa5c4080e6da7eca
generated_at: 2026-10-29T05:32:47.059000+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration test that guards a single invariant: a Product must never expose MongoDB internals (`_id`, `__v`) on any response path. It covers both the hydrated-document path (`toJSON`) and the `.lean()` list path (which bypasses `toJSON` and must be transformed manually).

## Key elements

- **`setupTestDb()`** — called once at module level to spin up (or reset) the test database before the suite runs.
- **`describe('product serialization')`** — the single suite; three test cases:
  - *normalizes a hydrated document via `toJSON`* — seeds a product with `createProduct`, calls `product.toJSON()`, asserts `id` is present and a stringified dump contains neither `_id` nor `__v`.
  - *normalizes a single lookup via `productService.getById`* — seeds a product, calls `getById` with an admin caller scope, asserts the returned object already matches the wire shape (`id`, `title`) and contains no internal fields.
  - *normalizes a lean list via `productService.search`* — seeds a product, calls `search` with an empty filter and admin scope, asserts the single list item has a 24-hex `id` and that `_id` / `__v` are `undefined`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | Imports `productService`; exercises `getById` and `search` (both called with `productService.callerScope(callerAs('admin'))`). |
| `src/modules/products/tests/factories.ts` | Imports `createProduct` to seed one document per test case. |
| `tests/support/callers.ts` | Imports `callerAs` to build the admin-scope caller argument passed to service methods. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb`; invoked at top level to prepare the DB. |
| `tests/support/stub.ts` | Imports `asStub` solely to cast a `.lean()` list item to `Record<string, unknown>` for property assertions. |

## Notes

- The file header JSDoc explicitly calls out **two** serialization paths that must be tested: `toJSON` (hydrated doc) and the manual `applyProductTransform` applied to `.lean()` results. The `getById` test covers the first; the `search` test covers the second.
- `getById` already runs `.toJSON()` internally before resolving a translation, so the test does **not** call a second transform on its result — the returned object is already the wire shape.
- Absence of `_id`/`__v` is verified via `JSON.stringify(...).not.toContain(...)`, which also catches nested occurrences (e.g., inside embedded objects), not just top-level keys.
- The `asStub` import is a type-cast helper, not a behavior stub; it exists only to satisfy the TypeScript compiler on the `.lean()` result.
