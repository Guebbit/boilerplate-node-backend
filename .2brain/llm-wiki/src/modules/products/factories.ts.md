---
source: src/modules/products/factories.ts
sha256: aa683dadadba356d8d26266e66cfe9a76fcdb41765fa1fe13706c526cd854458
generated_at: 2026-10-15T11:41:56.671917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/factories.ts

## Purpose

Builds product fixtures (catalogue rows) for the `shop` scenario and for any test that needs a seedable product document. It placeholderes only the required `title` and `price` fields and leaves every other field to Mongoose's own `default:`, so downstream readers (e.g. `tests/integration/scenarios/shop.test.ts`) see real serializer output rather than hand-guessed values.

## Key elements

- **`ProductOverrides`** — Type a caller may use to pin specific fields. Derived from the generated `Product` via `OverridesFor<Product>` so it stays in sync with the contract automatically.
- **`ProductFixture`** — Type representing a product ready for `productRepository.create`. `_id`, `title`, and `price` are required (non-optional); everything else is optional.
- **`makeProduct(overrides?)`** — The single exported factory function. Fills `title` (`'Test Product'`) and `price` (`9.99`) as defaults, applies `identityOf` for id/timestamps, converts `deletedAt`/`releaseDate` via `toDate`, and removes any `undefined` keys with `stripUndefined` before returning.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Provides `identityOf`, `toDate`, and the `OverridesFor` utility that underpin the type and identity logic.
- **`src/infrastructure/object-guards.ts`** — Provides `stripUndefined`, used to strip undefined keys so Mongoose defaults apply.
- **`src/modules/products/model.ts`** — Source of the `ProductDocument` and `ProductRecord` types that shape `ProductFixture`.
- **`src/types/index.ts`** — Source of the `Product` type from which `ProductOverrides` is derived.
- **`scenarios/products.ts`** — Primary consumer; calls `makeProduct` to seed the shop scenario catalogue.
- **`src/modules/products/tests/unit/factories.test.ts`** — Unit-tests `makeProduct` directly.
- **`src/modules/products/tests/factories.ts`** — Test helper that likely re-exports or wraps this factory for other test suites.
- **`src/modules/products/tests/integration/repository.test.ts`** — Integration test that uses the fixture via `productRepository.create`.

## Notes

- `available` and `currency` are accepted in `ProductOverrides` but **silently ignored** — they are not schema paths. Pin `onHand`/`reserved` for availability, or `NODE_DEFAULT_CURRENCY` (via `withEnvironment`) for currency.
- Because `ProductFixture` marks `_id`, `title`, and `price` as required (not optional), callers can access `fixture.title` without a non-null assertion.
- The spread order in `makeProduct` is: identity defaults → `title`/`price` placeholders → caller overrides (with undefined stripped). A caller-supplied `title` or `price` will override the placeholder.
