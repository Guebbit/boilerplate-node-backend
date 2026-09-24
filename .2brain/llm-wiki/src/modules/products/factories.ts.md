---
source: src/modules/products/factories.ts
sha256: 0546ba7359094cfa432afa9c0993b30d6fe09ceea85e3b86971cee1f9d08cfa8
generated_at: 2026-09-23T19:26:43.233983+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/factories.ts

## Purpose

Provides a single-purpose fixture builder (`makeProduct`) that produces a minimal product row for the `shop` scenario catalogue and for any test that needs a catalogue entry. It intentionally sets only the schema-required `title` and `price` fields, leaving all other fields to Mongoose defaults so integration tests read real seeded values through the serializer.

## Key elements

- **`ProductOverrides`** (type) — `OverridesFor<Product>`; the set of fields a caller may pin. Derived from the generated `Product` type so it stays in sync with schema changes. Accepts `available` but ignores it (not a schema path; use `onHand`/`reserved` instead).
- **`ProductFixture`** (type) — `Partial<ProductDocument> & Pick<ProductRecord, '_id' | 'title' | 'price'>`; the return shape of the factory. The three picked fields are non-optional so callers can access `fixture.title` without a non-null assertion.
- **`makeProduct`** (function) — Accepts an optional `ProductOverrides` object (destructured to pull out `id`, `createdAt`, `updatedAt`, `deletedAt` for special handling) and returns a `ProductFixture`. Fills `title: 'Test Product'` and `price: 9.99` as defaults; converts `deletedAt` via `toDate`; strips `undefined` values; merges identity fields via `identityOf`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — Imports the generic helpers `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor` type utility that this factory is built on.
- **`src/modules/products/model.ts`** — Imports `ProductDocument` and `ProductRecord` types used in the `ProductFixture` intersection.
- **`src/types/index.ts`** — Imports the generated `Product` type from which `ProductOverrides` is derived.
- **`scenarios/products.ts`** — Primary consumer; calls `makeProduct` to build the shop scenario catalogue rows.
- **`src/modules/products/tests/unit/factories.test.ts`** — Unit-tests `makeProduct` directly.
- **`src/modules/products/tests/integration/repository.test.ts`** — Uses the produced fixture as input to `productRepository.create` in integration tests.
- **`src/modules/products/tests/factories.ts`** — Test-scope wrapper/re-export around this module's exports.

## Notes

- `available` appears in `ProductOverrides` (inherited from `Product`) but is **not** a Mongoose schema path; passing it has no effect. To control availability, set `onHand` and/or `reserved` instead.
- The factory deliberately does **not** set optional fields (e.g. `description`, `sku`, timestamps beyond what the caller pins) so that Mongoose `default:` values and pre-save hooks are exercised in integration tests.
- `deletedAt` is the only date field given special treatment (wrapped in `toDate`); `createdAt`/`updatedAt` are handled by `identityOf`.
