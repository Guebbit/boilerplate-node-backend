---
source: src/modules/wishlist/openapi.yaml
sha256: caaa33384cdac8c854ad9bea8e232ee7bbdb2faf7a034b2108f9d78b299deb97
generated_at: 2026-10-29T06:34:34.379473+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the wishlist module. It defines the four endpoints a client uses to save, list, remove, and move-to-cart products, plus the schemas those endpoints exchange. The `x-personal-data` extension lets the account-export bundler splice wishlist data into `AccountExportResponse` without the module hard-coding the export shape.

## Key elements

- **`GET /wishlist`** (`getWishlist`) — returns the authenticated user's saved product ids and live availability. Never 404; empty list is the "no wishlist" state.
- **`POST /wishlist/items`** (`createWishlistItem`) — saves a product by id. Idempotent: re-saving an existing line returns the same 200. 404 for a non-public product; 422 for a malformed body.
- **`DELETE /wishlist/items/{productId}`** (`deleteWishlistItem`) — removes one line. 404 if the caller doesn't hold that line.
- **`POST /wishlist/items/{productId}/move-to-cart`** (`moveWishlistItemToCart`) — transfers a saved line into the cart (qty 1, or increment). Staff/admins get 403 (no basket). 404 and 422 (`CART_QUANTITY_LIMIT`) here are the *cart's* answers, not the wishlist's.
- **`CreateWishlistItemRequest`** — single required field `productId`.
- **`WishlistItem`** — a line: `productId` + `availability` (sourced from the cart module's `LineAvailability`). No quantity by design.
- **`WishlistExportItem`** — the stripped-down line (`productId` only) carried in the personal-data export; availability is omitted because it is the shop's live opinion, not user data.
- **`WishlistResponse`** — `{ items: WishlistItem[] }`, the uniform body returned by all three mutating endpoints.
- **`x-personal-data.wishlist`** — extension consumed by the bundler to register this module's slice in `AccountExportResponse`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared building block in this spec is `$ref`-ed from there: `Unauthorized`, `NotFound`, `ValidationError`, `Forbidden` responses; the `ProductIdPathParam` path parameter; and the `Id` schema used by request/response bodies.
- **`src/modules/wishlist/module.yaml`** — module manifest that bundles this spec. The `x-personal-data` block is read by the same bundler that processes `module.yaml`, so registering or removing the module here toggles the export section automatically.
- **`src/modules/cart/openapi.yaml`** (implicit) — `WishlistItem.availability` reuses the cart's `LineAvailability` enum, and the move-to-cart endpoint's 404/422 semantics are inherited from the cart, not defined here.

## Notes

- A wishlist line is intentionally **quantity-free**; the only "amount" question it answers is "do I want this?" Adding a quantity is the cart's job.
- `availability` on `WishlistItem` is the shop's *live* stock opinion, not something the user saved. It is excluded from `WishlistExportItem` for that reason.
- The 404 on `move-to-cart` can mean either "not on your wishlist" *or* "product no longer publicly visible (cart's rule)." The 422 is likewise the cart's `NODE_CART_LINE_MAX` ceiling, surfaced here as a convenience.
- Staff and administrators may maintain a wishlist but cannot use `move-to-cart`; the 403 is a role check on basket ownership, not a wishlist permission.
- All three mutating endpoints return the **full** `WishlistResponse` (not a single line, not 204). Clients should treat the body as the source of truth for the post-mutation state.
