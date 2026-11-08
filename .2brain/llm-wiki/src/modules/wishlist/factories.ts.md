---
source: src/modules/wishlist/factories.ts
sha256: e4c657f9b17dae6bf1dde372f9b48f3c96000303def1e2710123d73178ecb392
generated_at: 2026-11-08T09:12:32.805585+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/factories.ts

## Purpose

Factory for building wishlist fixtures in tests. It accepts a bare `userId` and optional product ids, then wraps them into the `{ productId }` shape the Mongoose schema stores. The design mirrors `../cart/factories` (owner-addressed, no `_id` override) but diverges on one point: a wishlist line is just a product id, not a full `WishlistItem` with quantity, because a wishlist encodes "do I want this," not "how many."

## Key elements

- **`WishlistOverrides`** (interface) — The minimal input surface: a required `userId: Id` and an optional `productIds?: Id[]`. Omitting `productIds` lets the schema's `default: []` apply.
- **`WishlistFixture`** (type) — `Partial<WishlistDocument> & Pick<WishlistDocument, 'userId'>`; the return shape, ready to pass to `wishlistRepository.create`.
- **`makeWishlist`** (function) — Converts the overrides into a fixture: builds an `ObjectId` for the owner, and maps each bare product id into `{ productId: ObjectId }` entries under `items`. When `productIds` is `undefined`, the `items` key is omitted entirely so the schema default fires.

## Relationships

- **`src/modules/wishlist/model.ts`** — Imports `WishlistDocument` as the type basis for `WishlistFixture`.
- **`src/types/index.ts`** — Source of the `Id` type used in both `WishlistOverrides` and the function signature.
- **`src/modules/wishlist/tests/unit/factories.test.ts`** — Unit tests exercising `makeWishlist` directly.
- **`scenarios/wishlist.ts`** — Integration scenarios that call `makeWishlist` to seed wishlist state before acting on it.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Uses the factory to create a wishlist fixture as setup for fulfillment assertions.

## Notes

- `productIds` must be **bare ids**, not pre-wrapped `{ productId }` objects. The wrapping into the storage shape happens inside `makeWishlist`. Passing already-wrapped objects will double-nest.
- The `items` key is deliberately **absent** (not `items: []`) when `productIds` is undefined, so the Mongoose schema default is the single source of truth for the empty case.
- `userId` is always present in the return value; it cannot be overridden to `undefined` through `WishlistOverrides`.
