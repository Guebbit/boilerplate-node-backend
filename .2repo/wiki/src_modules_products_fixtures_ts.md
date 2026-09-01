# src/modules/products/fixtures.ts

## Purpose

Builds a single product fixture intended for the demo dataset (`./demo`) and any test that needs a catalogue row. It intentionally leaves schema defaults unset, pinning only the required `title` and `price` placeholders, so that `scripts/export-demo-dataset.ts` reads seeded rows back through the real serializer rather than a hand-built guess.

## Key elements

- **`ProductOverrides`** (type) — Derived from the generated `Product` via `OverridesFor<Product>`, so adding a field to the schema automatically widens the override surface without manual upkeep.
- **`ProductFixture`** (type) — The concrete shape returned by `makeProduct`: `Partial<ProductDocument>` intersected with `Pick<ProductSnapshot, '_id' | 'title' | 'price'>`. Those three factory-set fields are required (not optional) so callers can read `fixture.title` without a non-null assertion.
- **`makeProduct`** (function) — Accepts an optional `ProductOverrides` object and returns a `ProductFixture`. Spreads `identityOf` for `_id`/timestamps, sets `title: 'Test Product'` and `price: 9.99`, then applies `compact` to the caller's overrides (including `deletedAt` coerced via `toDate`). Any field the caller omits is left to Mongoose's `default:`.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Source of the generic utilities `identityOf`, `compact`, `toDate`, and the `OverridesFor` helper that all module-level fixtures share.
- **`src/modules/products/model.ts`** — Provides the `ProductDocument` and `ProductSnapshot` types that shape the `ProductFixture` return type.
- **`src/types/index.ts`** — Supplies the generated `Product` type, from which `ProductOverrides` is derived.
- **`src/modules/products/demo.ts`** — Consumes `makeProduct` to seed the demo catalogue.
- **`src/modules/products/tests/fixtures.ts`**, **`src/modules/products/tests/unit/fixtures.test.ts`**, **`src/modules/products/tests/integration/repository.test.ts`** — Test files that build or assert against product fixtures produced here.

## Notes

- `available` is accepted in the overrides object but **silently ignored** (it is not a Mongoose schema path). To control stock, pin `onHand` / `reserved` instead.
- Because the fixture deliberately omits schema-defaulted fields, tests that assert on those fields must do so *after* a round-trip through the repository, not on the in-memory fixture object.
- `compact` strips `undefined` values from the overrides spread, so passing a key with an explicit `undefined` value is a no-op.
