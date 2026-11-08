---
source: src/modules/products/factories.ts
sha256: 3f432091f66689a99367f63a8c94c96a44c56f04b5a696082f9047c0c748debe
generated_at: 2026-11-08T07:44:24.336486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/factories.ts

## Purpose

Builds minimal product fixtures (placeholder `title` + `price`) for the `shop` scenario catalogue and for any test that needs a catalogue row. Everything else is deliberately left unset so Mongoose schema defaults apply, letting integration tests read seeded rows back through the real serializer rather than a hardcoded guess.

## Key elements

- **`ProductOverrides`** — type alias (`OverridesFor<Product>`) describing which fields a caller may pin. Derived from the generated `Product` type so contract changes stay in sync.
- **`ProductFixture`** — the shape returned by `makeProduct`: `Partial<ProductDocument>` with `_id`, `title`, and `price` promoted to required (non-optional) so consumers can read them without `!`.
- **`makeProduct(overrides?)`** — constructs a single fixture. Destructures `id`, `createdAt`, `updatedAt` through `identityOf`, sets placeholder `title: 'Test Product'` and `price: '9.99'`, coerces `deletedAt`/`releaseDate`/`restockDate` via `toDate`, and runs the result through `stripUndefined` before returning.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — source of `identityOf`, `toDate`, and the `OverridesFor` generic used to derive `ProductOverrides`.
- **`src/infrastructure/object-guards.ts`** — provides `stripUndefined`, applied to the merged fixture to drop keys with `undefined` values before the object is returned.
- **`src/modules/products/model.ts`** — source of `ProductDocument` and `ProductRecord` types that shape `ProductFixture`.
- **`src/types/index.ts`** — source of the `Product` type that `ProductOverrides` is derived from.
- **`scenarios/products.ts`** — primary consumer; calls `makeProduct` to seed the shop catalogue.
- **`src/modules/products/tests/unit/factories.test.ts`** — unit-tests `makeProduct` output directly.
- **`src/modules/products/tests/integration/repository.test.ts`** — uses `makeProduct` to build fixtures passed to `productRepository.create`.
- **`src/modules/products/tests/factories.ts`** — test-adjacent wrapper/re-export in the test directory.

## Notes

- `available` and `currency` are *accepted* as overrides (they exist on `Product`) but are **ignored** — they are not Mongoose schema paths. Use `onHand`/`reserved` for stock and `NODE_DEFAULT_CURRENCY` (via `withEnvironmentOverrides`) for currency.
- Only `title` and `price` are placeholdered; every other field is left to the schema's `default:`. Do not add extra placeholders here.
- `stripUndefined` is applied last, so any override set to `undefined` is silently dropped rather than written into the document.
