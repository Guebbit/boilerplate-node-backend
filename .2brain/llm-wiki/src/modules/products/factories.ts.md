---
source: src/modules/products/factories.ts
sha256: 14558de77af887c1fa7778b0eb229d8b1143eaf76de3927773b088fa99a40d9c
generated_at: 2026-10-29T05:26:25.864322+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/factories.ts

## Purpose

Builds a single product fixture row for the `shop` scenario's catalogue (`scenarios/products.ts`) and for any test that needs a seeded product document. It fills only the two required fields (`title`, `price`) with placeholders and leaves every other field to the Mongoose schema's `default:` values, so downstream reads go through the real serializer rather than a hardcoded guess.

## Key elements

- **`ProductOverrides`** (type) — Alias for `OverridesFor<Product>`; describes which fields a caller may pin. Derived from the generated `Product` type so contract changes stay in sync.
- **`ProductFixture`** (type) — `Partial<ProductDocument> & Pick<ProductRecord, '_id' | 'title' | 'price'>`. The three factory-set fields are *required* (not optional), allowing callers to read `fixture.title` without a non-null assertion.
- **`makeProduct`** (const, factory fn) — Accepts an optional `ProductOverrides` object. Destructures out identity/date fields, applies `identityOf` and `toDate`, injects placeholder `title: 'Test Product'` and `price: 9.99`, spreads any remaining overrides, and runs the result through `stripUndefined`. Returns a `ProductFixture` ready for `productRepository.create`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Provides `identityOf`, `toDate`, and the `OverridesFor` generic used by both exports.
- **`src/infrastructure/object-guards.ts`** — Provides `stripUndefined`, which removes any `undefined` values from the assembled fixture before it is returned.
- **`src/modules/products/model.ts`** — Source of the `ProductDocument` and `ProductRecord` types used in `ProductFixture`.
- **`src/types/index.ts`** — Source of the `Product` type that `ProductOverrides` is derived from.
- **`scenarios/products.ts`** — Primary consumer; calls `makeProduct` to populate the shop catalogue fixture.
- **`src/modules/products/tests/unit/factories.test.ts`** — Unit tests exercising `makeProduct` behavior.
- **`src/modules/products/tests/integration/repository.test.ts`** — Integration test that consumes the produced fixtures through the repository.
- **`src/modules/products/tests/factories.ts`** — Test-scoped factory helpers that build on or alongside this module.

## Notes

- `available` and `currency` are *accepted* in overrides but **silently ignored** — they are not Mongoose schema paths. Use `onHand`/`reserved` for stock and the `NODE_DEFAULT_CURRENCY` environment override for currency instead.
- Date fields (`createdAt`, `updatedAt`, `deletedAt`, `releaseDate`, `restockDate`) are coerced through `toDate`; pass `null`/`undefined` to leave them unset rather than passing a string that `toDate` can't handle.
- The `...stripUndefined` call at the end means any override explicitly set to `undefined` is removed from the final object rather than serialized as a key with an `undefined` value.
