---
source: src/modules/products/factories.ts
sha256: 024f4c2180303619e1e912a6ec6395857b0ad25683d2399a69aff57d3c094a82
generated_at: 2026-09-27T15:31:55.157863+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/factories.ts

## Purpose

Builds product row fixtures for the `shop` scenario catalogue and for any test that needs a catalogue row. It deliberately sets only the required `title` and `price` fields (as placeholders), leaving every other field to the Mongoose schema's own `default:` values, so integration tests read seeded rows back through the real serializer rather than a guessed shape.

## Key elements

- **`ProductOverrides`** — type alias derived from `OverridesFor<Product>` (the generated `Product` type). Callers may pin any field; absent fields are left to the schema. `available` and `currency` are accepted but silently ignored (they are not schema paths).
- **`ProductFixture`** — shape accepted by `productRepository.create`. Extends `Partial<ProductDocument>` with `Pick<ProductRecord, '_id' | 'title' | 'price'>`, making those three fields required so callers can read `fixture.title` without a non-null assertion.
- **`makeProduct(overrides?)`** — builds one fixture. Fills `title: 'Test Product'` and `price: 9.99` by default, applies `identityOf` for `_id`/timestamps, runs `toDate` on `deletedAt`, and merges caller overrides via `stripUndefined`. Returns a `ProductFixture`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — source of `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` generic used by the type aliases.
- **`src/modules/products/model.ts`** — provides the `ProductDocument` and `ProductRecord` types that shape `ProductFixture`.
- **`src/types/index.ts`** — provides the generated `Product` type that `ProductOverrides` derives from, keeping the override surface in sync with the contract.
- **`scenarios/products.ts`** — primary production-of-code consumer; builds the `shop` scenario catalogue by calling `makeProduct`.
- **`src/modules/products/tests/factories.ts`** — test-specific re-exports or extensions of this module.
- **`src/modules/products/tests/unit/factories.test.ts`** — unit tests for `makeProduct`.
- **`src/modules/products/tests/integration/repository.test.ts`** — integration tests that seed rows via fixtures built here.

## Notes

- `available` and `currency` can appear in overrides without error but have no effect; use `onHand`/`reserved` for stock state and the `NODE_DEFAULT_CURRENCY` environment variable (via `withEnvironment`) for currency.
- All unspecified fields are intentionally left to Mongoose `default:` — do not add "safe" hardcoded values here; that defeats the purpose of reading rows back through the real serializer.
