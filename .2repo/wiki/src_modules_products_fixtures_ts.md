# src/modules/products/fixtures.ts

## Purpose
Builds a single product fixture with only the required `title` and `price` fields placeholdered, leaving all other fields to Mongoose schema defaults. Serves both the demo dataset (`./demo`) and any test that needs a catalogue row, ensuring seeded rows are read back through the real serializer rather than a hand-crafted guess.

## Key elements
- **`ProductOverrides`** — type alias for `OverridesFor<Product>` (derived from the generated `Product` type, not restated). Accepts any field a caller wants to pin; omits everything else.
- **`ProductFixture`** — return type of `makeProduct`. Extends `Partial<ProductDocument>` with `Pick<ProductSnapshot, '_id' | 'title' | 'price'>`, making those three fields non-optional so callers can dereference them without `!`.
- **`makeProduct(overrides?)`** — the sole builder function. Fills `title: 'Test Product'` and `price: 9.99`, spreads `identityOf` for `_id`/`createdAt`/`updatedAt`, and merges any caller-supplied fields via `stripUndefined`. Returns a `ProductFixture` ready for `productRepository.create`.

## Relationships
- **`src/infrastructure/persistence/fixtures.ts`** — provides the generic helpers `identityOf`, `stripUndefined`, `toDate`, and the `OverridesFor<T>` type used by all domain fixtures.
- **`src/modules/products/model.ts`** — supplies the `ProductDocument` and `ProductSnapshot` types that shape `ProductFixture`.
- **`src/types/index.ts`** — source of the generated `Product` type that `ProductOverrides` is derived from.
- **`src/modules/products/demo.ts`** — primary consumer; calls `makeProduct` to seed the demo catalogue.
- **`src/modules/products/tests/fixtures.ts`** — test-local fixture layer that likely re-exports or extends `makeProduct` for test scenarios.
- **`src/modules/products/tests/unit/fixtures.test.ts`** — unit-tests the `makeProduct` output shape and defaults.
- **`src/modules/products/tests/integration/repository.test.ts`** — feeds `makeProduct` output into `productRepository.create` to exercise the real serializer.

## Notes
- `available` appears in `ProductOverrides` (inherited from `Product`) but is **not** a Mongoose schema path — it is accepted and silently ignored. To fix availability, pin `onHand` or `reserved` instead.
- The file intentionally does **not** set schema-defaulted fields (e.g., `stock`, `metadata`). This is a deliberate design choice: the demo export script (`scripts/export-demo-dataset.ts`) relies on reading rows back through the real serializer, so the fixture must exercise the default pipeline rather than bypass it.
- All exports are type-level or a single function; there is no class or side-effectful module state.
