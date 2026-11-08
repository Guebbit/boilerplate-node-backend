---
source: src/modules/products/tests/integration/schema-contract.test.ts
sha256: 4e7bc9de37f845a58acac7750a0a5e7d948bdc68ec459c93416c1d0da7f48878
generated_at: 2026-11-08T07:52:38.426241+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/schema-contract.test.ts

## Purpose

Verifies Mongoose schema-level declarations (defaults, `required`, `select: false`, serialization shape) for the Product model by running against a real MongoDB instance. It exists separately from the sibling transform tests because a mocked model would assert the mock's interpretation of `default`/`required` rather than Mongoose's actual behaviour.

## Key elements

- **`setupTestDb()`** — Spins up a real in-memory or temporary Mongo instance for the test run.
- **`describe('product schema')`** — Top-level suite; two assertions:
  - *accepts a price of zero* — Confirms `required` on a `Number` field rejects `undefined` but permits `0`. Creates a product via `productRepository.create` with `price: '0.00'` and asserts the round-tripped value.
  - *serialises to `id`, never `_id` or `__v`* — Creates a product via the factory, calls `product.toJSON()`, and asserts the serialised object exposes `id` while omitting `_id` and `__v`.

## Relationships

- **`src/modules/products/repository.ts`** — Imports `productRepository`; the zero-price test calls `productRepository.create` directly to exercise the schema through the repository layer.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct`; used by the serialization test to obtain a fully-populated product document.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb`; provides the real MongoDB connection the suite depends on.

## Notes

- This file tests **Mongoose's own semantics**, not application logic. That is why it requires a real database and cannot be unit-tested with a mock model.
- Price is stored as a **string** (`'0.00'`), not a numeric type. The zero-price test exists specifically to guard against a future truthiness-based guard (`if (!price)`) that would incorrectly reject free products.
- Serialization shape (`id` present, `_id`/`__v` absent) is asserted on the `toJSON()` output — the shape clients actually receive — not on the raw Mongoose document.
