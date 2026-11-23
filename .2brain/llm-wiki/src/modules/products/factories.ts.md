---
source: src/modules/products/factories.ts
source_sha256: b7ad4d6a9b9ae974f0c38b890af92aced0de1f1333ca652e53027d92a64f6a3d
context_sha256: 18bb1b0247eed3e9ae504cac9c891840440cf36851603163e3022380fcac71f0
generated_at: 2026-11-22T07:09:52.107208+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/factories.ts

## Purpose
Builds a product fixture row for the `shop` scenario's catalogue (`scenarios/products.ts`) and for any test that needs a catalogue row. It sets only the required `title` and `price` placeholders and leaves all other fields to the schema's own defaults, so integration tests read seeded rows back through the real serializer.

## Key elements
- `ProductOverrides` — type alias `OverridesFor<Product>`, derived from the generated `Product` type so it tracks contract changes. `currency` is accepted but ignored because it is not a schema path (use `NODE_DEFAULT_CURRENCY`, e.g. via `withEnvironmentOverrides` in a test).
- `ProductFixture` — `Partial<ProductDocument>` with `_id`, `title` and `price` required (from `ProductRecord`), so callers can read `fixture.title` without a `!`.
- `makeProduct(overrides = {})` — returns a `ProductFixture` ready for `productRepository.create`:
  - Spreads `identityOf({ id, createdAt, updatedAt })` for the identity and timestamp fields.
  - Defaults `title: 'Test Product'` and `price: '9.99'`.
  - Passes the remaining overrides through `stripUndefined`, with `deletedAt`, `releaseDate` and `restockDate` converted by `toDate`.

## Relationships
- `src/infrastructure/persistence/factories.ts` — supplies `identityOf`, `toDate` and the `OverridesFor` type.
- `src/infrastructure/object-guards.ts` — supplies `stripUndefined`, which drops undefined keys so the schema defaults apply.
- `src/modules/products/model.ts` — supplies the `ProductDocument` and `ProductRecord` types used by `ProductFixture`.
- `src/types/index.ts` — supplies the `Product` type that `ProductOverrides` derives from.
- `scenarios/products.ts` — consumes the factory to build the `shop` catalogue.
- `src/modules/products/tests/factories.ts`, `src/modules/products/tests/unit/factories.test.ts` and `src/modules/products/tests/integration/repository.test.ts` — test-side neighbors that relate to this file through the dependency graph. Their contents are not shown here.

## Notes
- A product holds no stock, so there is no stock field to pin.
- `_id` is required on `ProductFixture`, and `identityOf` is the source of it here.
- Only `deletedAt`, `releaseDate` and `restockDate` get explicit date conversion. All other overrides pass through unchanged.
