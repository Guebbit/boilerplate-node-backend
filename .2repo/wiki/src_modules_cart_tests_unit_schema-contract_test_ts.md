# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Contract test for the Mongoose `cartSchema`. It asserts the schema's shape, indexes, defaults, and sub-document structure at the feature boundary, and encodes the one distinguishing fact between cart and wishlist: a cart line carries a `quantity` field while a wishlist line does not.

## Key elements

- **`RETENTION_SECONDS`** – Derived from `NODE_CART_RETENTION_DAYS` (default 365); mirrors the model's TTL default so the TTL assertion tracks env changes.
- **`describe('cartSchema')`** – Top-level assertions: only `userId` is required; `userId` has a `unique` index; `items` defaults to `[]`; `userId` is an `ObjectId` ref to `User`; exact index list (TTL on `updatedAt`, `items.productId`, `userId`); TTL `expireAfterSeconds` matches `RETENTION_SECONDS` and appears only on the `updatedAt` index; `timestamps: true`.
- **`describe('cartSchema — a line')`** – Sub-document assertions on `items`: requires `productId` + `quantity`; `_id` is suppressed; `productId` refs `Product`; `quantity` has `min: 1`; the field set is exactly `['productId', 'quantity']`.

## Relationships

- **`src/modules/cart/model.ts`** – Source of `cartSchema`, the unit under test. Every assertion here reads the schema's runtime metadata (indexes, paths, defaults, refs) from that export.
- **`tests/support/schema.ts`** – Provides the introspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `optionsOf`, `pathNames`, `pathOptions`, `refOf`, `subSchema`, `typeOf`) that turn the Mongoose schema into plain arrays/objects for comparison.

## Notes

- The TTL test compares against the computed `RETENTION_SECONDS` constant rather than a hardcoded number, so changing `NODE_CART_RETENTION_DAYS` shifts the policy and the expectation together. It also asserts the TTL appears *only* on `updatedAt`, not on another index.
- `unique: true` on `userId` is the load-bearing design choice: it makes "one cart per user" a database constraint, which lets every mutation be a single `findOneAndUpdate({ upsert: true })` with no prior read.
- `quantity` `min: 1` is intentional — a zero-quantity line would pass "is it in the cart?" checks while contributing nothing to totals. The schema forbids that state; removal means deleting the line.
