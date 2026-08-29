# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Contract tests that pin the structural invariants of `cartSchema` at the Mongoose-definition level: required paths, index specs, defaults, field types, and sub-schema shape. They exist so that the two invariants the rest of the cart module depends on — "one cart per user" (unique index enabling atomic upserts) and "a cart line always has a quantity ≥ 1" — cannot be silently broken by a model edit without a test going red.

## Key elements

- **`describe('cartSchema')`** — Asserts on the top-level document schema:
  - Only `userId` is required; `items` defaults to `[]`; `userId` is a `ref('User')` `ObjectId`; `timestamps` is enabled; the exact index set is `userId_1` (unique) and `items.productId_1`.
- **`describe('cartSchema — a line')`** — Asserts on the `items` sub-schema (extracted via `subSchema`):
  - Required paths are exactly `productId` and `quantity`; no `_id`; `productId` refs `Product`; `quantity` has `min: 1`; the field list is exactly those two (the boundary that separates a cart line from a wishlist line).
- **Test helpers (from `@tests/schema`)** — `requiredPaths`, `indexOptionSpecs`, `indexSpecs`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `subSchema`, `pathOptions`, `pathNames`. All read Mongoose metadata; none instantiate documents or touch a database.

## Relationships

- **`src/modules/cart/model.ts`** — Source of `cartSchema`, the single object under test. Changes to required paths, indexes, defaults, or sub-schema fields here will break these assertions.
- **`tests/support/schema.ts`** — Provides every structural-inspection helper imported at the top. The test file's assertions are only as expressive as the helpers defined there.

## Notes

- These tests inspect **schema metadata only** — no Mongoose connection, no document creation, no DB round-trip. They run in pure unit-test speed.
- The file's doc block explicitly states the design rationale for `unique: true` on `userId` (enables `findOneAndUpdate(..., { upsert: true })` without a preceding read) and for `quantity` as the sole distinguishing field between cart and wishlist lines. If those design decisions change, the comments must be updated alongside the assertions.
- The index assertion uses `toEqual` (exact set match), not `toContain` — adding or removing any index on the cart schema will fail this test.
