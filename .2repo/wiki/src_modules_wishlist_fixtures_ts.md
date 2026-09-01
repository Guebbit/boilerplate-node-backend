# src/modules/wishlist/fixtures.ts

## Purpose

Factory that builds a wishlist fixture for repository-level tests and demos. Mirrors the cart fixture pattern (owner-addressed, pinned `_id` for byte-stable exports) but treats each line as a bare product id rather than a quantity, since a wishlist answers "do I want this?" rather than "how many?"

## Key elements

- **`WishlistOverrides`** — Input interface for `makeWishlist`. Requires `userId` (24-char hex), optional `productIds` (bare ids), and inherits `FactoryIdentity` for identity fields.
- **`WishlistFixture`** — Output type: `Partial<WishlistDocument>` with `userId` required. Shaped for `wishlistRepository.create`.
- **`makeWishlist(overrides)`** — Constructs the fixture. Converts `userId` and each `productId` to `Types.ObjectId`, spreads `identityOf(identity)`, and wraps bare `productIds` into the `{ productId }` shape the schema stores. Omitting `productIds` leaves the schema's `default: []` untouched.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Imports `identityOf` and the `FactoryIdentity` type to handle shared identity fields (`_id` pinning, etc.).
- **`src/modules/wishlist/model.ts`** — Imports `WishlistDocument` to type the fixture output and to guarantee the `{ productId }` item shape matches the Mongoose schema.
- **`src/types/index.ts`** — Imports the `Id` alias used for all user/product id fields.
- **`src/modules/wishlist/tests/unit/fixtures.test.ts`** — Consumes `makeWishlist` and the exported types to assert fixture shape.
- **`src/modules/wishlist/demo.ts`** — Consumes `makeWishlist` to seed demo data.

## Notes

- `productIds` is intentionally **bare ids**, not `WishlistItem[]`; the wrapping into `{ productId }` happens inside `makeWishlist`. Passing pre-shaped objects will break the mapping.
- When `productIds` is `undefined` (not `[]`), the `items` key is omitted entirely so the schema default applies. Passing `[]` produces an explicit empty array — functionally equivalent but a different wire shape.
- The file's doc comment cross-references `../cart/fixtures` for the owner-addressed / pinned-`_id` convention; keep the two in sync if that contract changes.
