---
source: src/modules/wishlist/presenter.ts
sha256: 5bf59e5ae79552cd16dbcfbb1e9842ce33216d15afeedd70c5f7ee68f7f1fa91
generated_at: 2026-11-08T09:13:29.587413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/presenter.ts

## Purpose
Presents the internal `WishlistDocument` model into the exact wire shape declared by `openapi.yaml` (`WishlistResponse`). It is the single mapping point between stored wishlist data and the API response, so the client can render everything else from its own product store.

## Key elements
- **`WishlistView`** (interface) — The API response shape: an array of `WishlistItem` objects. Built (not serialized) from the domain model.
- **`savedProductIds`** (function) — Extracts product IDs as strings from a `WishlistDocument`, preserving saved order. Returns `[]` for `null`.
- **`presentWishlist`** (function) — The main entry point. Takes a `WishlistDocument | null` plus a `ReadonlyMap<string, LineAvailability>` and returns a `WishlistView`. Products with no availability entry default to `'removed'`.

## Relationships
- **`src/modules/wishlist/model.ts`** — Source of the `WishlistDocument` type; the document shape this presenter reads from.
- **`src/types/index.ts`** — Source of the `LineAvailability` and `WishlistItem` types used in the response contract.
- **`src/modules/wishlist/index.ts`** — Module barrel; expected to re-export this file's public API for consumers of the wishlist module.
- **`src/modules/wishlist/service.ts`** — Expected caller of `presentWishlist`, supplying the document and an availability map to produce the API response.

## Notes
- The availability lookup uses `?? 'removed'` as a fallback, so a product that exists in the wishlist but is absent from the availability map is surfaced to the client as removed rather than throwing.
- `savedProductIds` coerces `productId` via `String()`, meaning the model may store it as a number while the wire format is always a string.
- The file intentionally does **not** fetch or resolve product details — availability is passed in as a parameter, keeping the presenter pure and synchronous.
