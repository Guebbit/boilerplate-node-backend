# src/modules/wishlist/factory.ts

## Purpose

Builds a ready-to-persist wishlist fixture for test/demo use. Follows the same ownership-by-`userId` convention as the cart factory: no wishlist id is part of the public shape, but a `_id` is still pinned so exported datasets remain byte-stable across runs.

## Key elements

- **`WishlistOverrides`** — Input interface. Requires `userId: Id` and optionally accepts `productIds?: Id[]`. Extends `FactoryIdentity` to allow pinning `_id`/timestamp fields.
- **`WishlistFixture`** — Return type. `Partial<WishlistDocument>` with `userId` mandatory; shaped for `wishlistRepository.create`.
- **`makeWishlist`** — Transforms overrides into the fixture: wraps `userId` and each `productId` in `Types.ObjectId`, spreads `identityOf(...)`, and maps `productIds` into the schema's `{ productId }` item shape. Omits `items` entirely when `productIds` is `undefined`, letting the schema's `default: []` apply.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — Imports `identityOf` and `FactoryIdentity`; this factory delegates `_id`/timestamp pinning to that shared helper.
- **`src/modules/wishlist/model.ts`** — Imports the `WishlistDocument` type to shape both the overrides and the fixture.
- **`src/types/index.ts`** — Imports the `Id` alias used throughout the public signatures.
- **`src/modules/wishlist/demo.ts`** — Consumes `makeWishlist` to seed demo data (inferred from module placement; no import visible in this file).

## Notes

- A wishlist line carries **only** a product id (no quantity). The factory accepts bare `Id[]` and wraps each into `{ productId }` internally, so call sites avoid ceremony.
- `productIds: undefined` (not an empty array) is the signal to skip the `items` key entirely; passing `[]` will produce `items: []` explicitly.
- The determinism rationale (pinned `_id` despite "no id on the wire") is documented inline and mirrors `../cart/factory` — the two factories are expected to stay in lockstep.
