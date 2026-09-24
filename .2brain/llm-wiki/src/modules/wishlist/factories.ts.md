---
source: src/modules/wishlist/factories.ts
sha256: e4c657f9b17dae6bf1dde372f9b48f3c96000303def1e2710123d73178ecb392
generated_at: 2026-09-23T19:47:02.931310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/factories.ts

## Purpose

Builds wishlist fixtures (ready for `wishlistRepository.create`) from minimal caller input. Follows the same owner-addressed pattern as cart factories: the document is keyed by `userId` and no wishlist `_id` is generated or transmitted, so no `_id` override is accepted.

## Key elements

- **`WishlistOverrides`** – Interface describing what a caller supplies: required `userId` and optional `productIds` (bare `Id[]`).
- **`WishlistFixture`** – Type alias: `Partial<WishlistDocument> & Pick<WishlistDocument, 'userId'>`. The shape handed to the repository.
- **`makeWishlist(overrides)`** – Converts a bare `userId` to a `Types.ObjectId` and, when `productIds` is provided, maps each id into the `{ productId: ObjectId }` shape the schema stores under `items`. If `productIds` is `undefined` the `items` key is omitted entirely so the schema's `default: []` applies.

## Relationships

- **`src/modules/wishlist/model.ts`** — Provides the `WishlistDocument` type used in the `WishlistFixture` alias.
- **`src/types/index.ts`** — Source of the shared `Id` type used in both `WishlistOverrides` fields.
- **`src/modules/wishlist/tests/unit/factories.test.ts`** — Unit-tests `makeWishlist` directly.
- **`scenarios/wishlist.ts`** — Consumes the fixture (via `makeWishlist`) to seed wishlist state in integration scenarios.

## Notes

- Omitting `productIds` (vs. passing `[]`) is intentional: it lets the schema default produce the empty array, keeping the fixture minimal. Passing an explicit `[]` would still set the key, which is functionally equivalent but a different code path.
- A wishlist line stores only `productId` (no quantity). This contrasts with cart items, which track a count. The factory wraps ids so callers never need to know the `{ productId }` envelope.
- Follows the same "no `_id` override" convention documented in `../cart/factories`; if you need a stable id for assertions, capture it from the repository's return value instead.
