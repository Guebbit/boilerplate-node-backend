---
source: src/modules/wishlist/openapi.yaml
sha256: e376bcca8755ff09faa9eb507b7f7f944e1d0c466744d91392d2299761706026
generated_at: 2026-09-23T19:47:49.490572+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) that defines the wishlist module's HTTP API surface: four operations over `/wishlist` for listing, saving, removing, and moving-to-cart a user's saved product ids. It serves as the machine-readable and human-readable specification that both the implementation and any client SDK generator consume.

## Key elements

- **GET /wishlist** (`getWishlist`) — Returns the authenticated user's saved product ids. Never 404s; absence and emptiness are the same state.
- **POST /wishlist** (`addWishlistItem`) — Saves a product id. Idempotent (re-saving returns the same 200). 404 if the product is hidden or soft-deleted.
- **DELETE /wishlist/{productId}** (`removeWishlistItem`) — Removes one line. 404 if the caller does not hold that line (stale client state).
- **POST /wishlist/{productId}/move-to-cart** (`moveWishlistItemToCart`) — Transfers a saved line into the cart (qty 1, or increment). Cart is written *before* the wishlist line is removed, so a mid-operation failure leaves the product SAVED rather than lost. 422 carries `CART_QUANTITY_LIMIT` if the existing cart line is already at 999.
- **WishlistItem** — A single saved line; contains only `productId` (no quantity, by design).
- **WishlistResponse / WishlistResponseEnvelope** — The data payload and the shared success/status/message/data envelope that every 200 returns.
- **AddWishlistItemRequest** — Body schema for the POST save; a single `productId`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All non-200 response schemas (`Unauthorized`, `NotFound`, `ValidationError`, `InternalError`), the `ProductIdPathParam`, and base value schemas (`Id`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) are `$ref`-imported from this root contract. This file never redefines them.
- **`src/modules/wishlist/module.yaml`** — The module manifest that declares this file as the wishlist module's OpenAPI contract and governs how it is loaded, versioned, and exposed to the wider system.

## Notes

- The spec is deliberately minimal: wishlist items carry no quantity. The design intent (stated in inline comments) is that "do I want this?" is the only question a wishlist answers; any quantity concern belongs to the cart.
- All four operations require `bearerAuth`; there is no anonymous access.
- The 404 on `move-to-cart` is semantically the *cart's* answer (product no longer publicly visible), not the wishlist's. A saved line can outlive a catalogue entry; the 404 fires at the cart's visibility check.
- The 422 on `move-to-cart` is likewise a cart-originated error (`CART_QUANTITY_LIMIT`), surfaced through this endpoint. Consumers should not conflate it with a wishlist validation failure.
