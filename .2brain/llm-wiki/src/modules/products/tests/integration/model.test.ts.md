---
source: src/modules/products/tests/integration/model.test.ts
sha256: 306c9caf35c9fd741d05f1e9ef4dd7cbe2b1110e793529e8cfceb1875f647ef9
generated_at: 2026-10-15T11:48:13.369957+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration tests that enforce a single invariant: product responses must never expose Mongoose internals (`_id`, `__v`). It covers both serialization paths — hydrated documents (via `toJSON`) and `.lean()` query results (which bypass `toJSON` and rely on manual mapping inside the service).

## Key elements

- **`describe('product serialization')`** — the sole test block, containing three cases:
  - **Hydrated document (`toJSON`)** — creates a product via factory, calls `product.toJSON()`, asserts `id` is the string form of `_id` and that neither `_id` nor `__v` appears in the JSON output.
  - **Single lookup (`getById`)** — calls `productService.getById` with an admin caller scope; asserts the returned object is already in wire shape (service calls `.toJSON()` internally) and contains no Mongoose fields.
  - **Lean list (`search`)** — calls `productService.search`, asserts each item has a 24-char hex `id` and that `_id` / `__v` are `undefined`. Uses `asStub` to widen the type for assertion.

## Relationships

- **`@modules/products/services`** — the unit under test; exercises `getById`, `search`, and `callerScope`.
- **`@modules/products/tests/factories`** — provides `createProduct` to seed known documents before each assertion.
- **`@tests/callers`** — `callerAs('admin')` builds the caller identity passed to service methods.
- **`@tests/setup-test-db`** — `setupTestDb()` initialises and tears down the in-test database connection.
- **`@tests/stub`** — `asStub` cast used to assert on `.lean()` results without full Mongoose typings.

## Notes

- The `.lean()` path is the trickier one: `.lean()` returns plain objects that skip `toJSON`, so the service must map `_id → id` and strip `__v` manually (via `applyProductTransform` internally). This test exists to guard against a regression where that mapping is removed or the field set drifts.
- `getById` already calls `.toJSON()` before returning, so the test asserts on the final wire shape directly — there is no second transform step to verify here.
- Leakage checks use `JSON.stringify(...).not.toContain('_id')`, a blunt string check that catches both a field key and any accidental nested occurrence. It is intentional: the invariant is "zero Mongoose-internal tokens on the wire."
