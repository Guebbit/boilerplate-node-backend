# src/modules/cart/factory.ts

## Purpose

Builds a deterministic `CartFixture` object ready for `cartRepository.create`. It exists so that fixtures (especially the committed demo dataset) are stable across runs — pinning the cart `_id` prevents hash-drift in `demo-data.json` that would otherwise go stale against the paired frontend.

## Key elements

- **`CartOverrides`** — input interface: requires `userId` (24-char hex) and optional `items: CartItem[]`; extends `FactoryIdentity` for the id fields.
- **`CartFixture`** — output type: `Partial<CartDocument> & Pick<CartDocument, 'userId'>`. `userId` is deliberately non-optional because a cart is always addressed by its owner.
- **`makeCart(overrides)`** — the single exported function. Converts `userId` and each `productId` from string to `Types.ObjectId`, spreads `identityOf(identity)` for the id fields, and maps `items` to the document shape. If `items` is `undefined` it omits the key entirely so the Mongoose schema default (`[]`) applies.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — supplies `identityOf` and the `FactoryIdentity` type that carry the pinned `_id` (and other id fields) through to the fixture.
- **`src/modules/cart/model.ts`** — provides the `CartDocument` type that `CartFixture` is shaped to satisfy.
- **`src/types/index.ts`** — provides `CartItem` and `Id` (the 24-char hex string alias) used in the interface and output.
- **`src/modules/cart/demo.ts`** — primary consumer; upserts by `userId` (owner) rather than by the cart `_id`.

## Notes

- Ids are **strings in, `ObjectId`s out**. Passing a raw string where Mongo expects an `ObjectId` in a line's `productId` would silently match nothing rather than error — the factory's conversion is the guard.
- Omitting `items` (vs. passing `[]`) matters: omission lets the schema `default: []` apply, which is the intended "no lines yet" state.
- The cart `_id` is pinned purely for **fixture determinism** (see `scripts/export-demo-dataset.ts`); no API endpoint accepts or returns a cart id. It is not a published handle.
