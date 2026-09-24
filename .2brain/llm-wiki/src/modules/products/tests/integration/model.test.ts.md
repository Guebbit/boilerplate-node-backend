---
source: src/modules/products/tests/integration/model.test.ts
sha256: 280831557c9c357e1149592a4725c8fe8bb620ac610f419f7337226327f67291
generated_at: 2026-09-23T19:29:35.079933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/model.test.ts

## Purpose

Integration test suite that guarantees the Products API never leaks MongoDB internals (`_id`, `__v`) in any response path. It covers the two distinct serialization mechanisms: hydrated Mongoose documents (which rely on the `toJSON` virtual) and `.lean()` query results (which bypass `toJSON` and must be mapped manually).

## Key elements

- **`describe('product serialization')`** — top-level suite; no explicit setup beyond the module-level `setupTestDb()` call.
- **`it('normalizes a hydrated document via toJSON')`** — creates a product via factory, calls `product.toJSON()` directly, asserts `id` is the string form of `_id` and that neither `_id` nor `__v` appears in the JSON string.
- **`it('normalizes a single lookup via productService.getById (no .lean())')`** — calls `productService.getById` with an admin caller scope; asserts the returned object is already in wire shape (`id`, `title`) with no `_id`/`__v`.
- **`it('normalizes a lean list via productService.search')`** — calls `productService.search` with an empty query and admin scope; asserts the single item has a 24-hex `id` and explicitly undefined `_id`/`__v`.

## Relationships

- **`src/modules/products/service.ts`** — under test. The suite calls `getById`, `search`, and `callerScope` from this module.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, used to seed a known document before each assertion.
- **`tests/support/callers.ts`** — provides `asAdmin()`, wrapped by `productService.callerScope` to establish the calling user context.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called at module load to connect/seed the test database before any test runs.
- **`tests/support/stub.ts`** — provides `asStub<T>`, used solely as a type-cast helper on the `.lean()` list item (no runtime behavior).

## Notes

- The file's JSDoc header explains *why* two separate tests exist: `.lean()` results skip the Mongoose `toJSON` virtual, so the service layer must apply its own transform (`applyProductTransform`). The test here does not exercise that transform by name but verifies its observable effect (no `_id`/`__v`).
- `getById` is documented (inline comment) to already call `.toJSON()` internally before returning, so the test asserts the final wire shape directly rather than checking for a second transform step.
- The `search` test asserts `id` matches `/^[\da-f]{24}$/` — i.e., the stringified Mongo ObjectId — rather than a deep-equality against the factory-created `_id`, keeping the assertion decoupled from a specific ID value.
