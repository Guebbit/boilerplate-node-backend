---
source: src/modules/products/tests/integration/schema-contract.test.ts
source_sha256: 6445bf4853022896a0b5153ce646b15a4bf4baa4a8ca94b4460ee63351cdba16
context_sha256: 0f6167f61d5fc83bb2853235ddd84cd224c7ac8a5f10f3d817310c7ed2496fca
generated_at: 2026-11-22T07:17:46.853727+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose
Integration test that checks the product Mongoose schema's declarations (defaults, `required`, `select: false`) against a real MongoDB. It deliberately avoids mocks: these are Mongoose behaviours, and a mocked model would only assert the mock's own interpretation. It is distinct from the sibling specs in the folder, which cover transforms.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database for the suite.
- `describe('product schema')`, with two tests:
  - **accepts a price of zero**: creates a product through `productRepository.create({ title: 'Free', price: '0.00' })` and expects `price` to be `'0.00'`. It guards against a truthiness-based check wrongly rejecting a free product, since `required` on a Number rejects `undefined` and not `0`.
  - **serialises to id, never _id or __v**: builds a product with `createProduct({ title: 'Serialised' })` and calls `toJSON()`. It expects `id` to equal `String(product._id)` and expects `_id` and `__v` to be absent.

## Relationships
- `src/modules/products/repository.ts`: supplies `productRepository`, whose `create` is exercised directly in the price-zero test.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`, which builds the persisted product for the serialisation test.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`, imported via the `@tests/setup-test-db` alias.

## Notes
- Imports mix styles: a relative path for the repository (`../../repository`) and `@modules/...` and `@tests/...` aliases for the factory and DB setup.
- The price is passed as the string `'0.00'` and read back as the string `'0.00'`.
