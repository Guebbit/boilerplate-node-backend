---
source: src/modules/wishlist/presenter.ts
sha256: 5bf59e5ae79552cd16dbcfbb1e9842ce33216d15afeedd70c5f7ee68f7f1fa91
generated_at: 2026-10-15T12:27:00.147917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/presenter.ts

## Purpose

Transforms the internal `WishlistDocument` into the wire shape declared by `openapi.yaml` (a `WishlistResponse`). This module is the single mapping point between the stored domain model and the API contract; the client renders product details from its own store.

## Key elements

- **`WishlistView`** (interface) — The response object shape: `{ items: WishlistItem[] }`. Built, not serialized.
- **`savedProductIds`** (const, exported) — Extracts product IDs (as `string[]`) from a `WishlistDocument | null`, preserving saved order. Returns `[]` for `null`.
- **`presentWishlist`** (const, exported) — Maps each saved product ID through an `availability` map to produce a `WishlistView`. Any ID missing from the map defaults to `'removed'`.

## Relationships

- **`src/modules/wishlist/model.ts`** — Source of the `WishlistDocument` type consumed by both exports.
- **`src/types/index.ts`** — Source of `LineAvailability` and `WishlistItem` types used in the output shape.
- **`src/modules/wishlist/service.ts`** — Expected caller of `presentWishlist`; supplies the availability map from its fulfillment logic.
- **`src/modules/wishlist/index.ts`** — Barrel file; re-exports this module's public API for external consumers.

## Notes

- `productId` is coerced to `string` via `String(productId)` in `savedProductIds`, so the map lookup in `presentWishlist` always uses string keys. The `ReadonlyMap` key type should therefore be `string`, not `number`.
- The module is side-effect-free: no I/O, no async, no mutation. It is safe to call in tests without mocks beyond the two arguments.
- A missing availability entry is intentionally treated as `'removed'` (product no longer offered), not as an error.
