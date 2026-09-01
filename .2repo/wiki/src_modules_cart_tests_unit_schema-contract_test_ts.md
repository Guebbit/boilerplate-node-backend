# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Schema-contract test for the cart Mongoose model. It pins down every structural invariant of `cartSchema` (required fields, types, refs, indexes, defaults, options, sub-schema shape) as explicit assertions, so any unintended schema change fails immediately without needing to spin up a database or instantiate documents.

## Key elements

- **`describe('cartSchema')`** — Top-level schema assertions:
  - `requiredPaths` → only `userId` is required.
  - `indexOptionSpecs` → `userId` carries a `unique` index (one cart per user).
  - `defaultOf(cartSchema, 'items')` → defaults to `[]`, not `undefined`.
  - `typeOf` / `refOf` → `userId` is an `ObjectId` referencing `User`.
  - `indexSpecs` → exactly two indexes: `items.productId+1` and `userId+1`.
  - `optionsOf(...).timestamps` → `true`.
- **`describe('cartSchema — a line')`** — Sub-schema (`items.$*`) assertions:
  - `requiredPaths` → `productId` and `quantity`; `_id` is disabled.
  - `refOf` → `productId` references `Product`.
  - `pathOptions(item, 'quantity').min` → `1` (zero-quantity lines are invalid).
  - `pathNames` → exactly `['productId', 'quantity']`, asserting the cart line is distinct from a wishlist line by the presence of `quantity`.
- All assertions use introspection helpers from `@tests/schema` rather than constructing documents.

## Relationships

- **`src/modules/cart/model.ts`** — Exports `cartSchema`, the sole subject under test. This file is its executable contract.
- **`tests/support/schema.ts`** — Provides the full set of Mongoose-schema introspection utilities (`requiredPaths`, `indexOptionSpecs`, `indexSpecs`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `subSchema`, `pathNames`, `pathOptions`) that this test uses to read schema metadata declaratively.

## Notes

- The file's module doc-comment and the `quantity` path-names assertion together make the **cart-vs-wishlist boundary** explicit: the only structural difference between the two line shapes is the `quantity` field.
- The `unique` index on `userId` is documented as the mechanism that lets every cart mutation be a single `findOneAndUpdate({ upsert: true })` with no preceding read.
- The `items.productId` index exists specifically so that product deletion can locate affected carts without a full-collection scan.
- Zero-quantity lines are deliberately rejected (`min: 1`); the design treats removal as line deletion, not quantity-zeroing.
