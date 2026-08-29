# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the wishlist module. It defines the four HTTP endpoints a client uses to save, list, remove, and move-to-cart a user's desired products, along with the request/response schemas. The wishlist is intentionally minimal — it stores product IDs only, never quantities — so that "I want this" and "how many" remain separate concerns (the latter belongs to the cart).

## Key elements

- **`GET /wishlist`** (`getWishlist`) — Returns the authenticated user's saved product IDs. Always `200`; an empty list and "no wishlist" are the same state.
- **`POST /wishlist`** (`addWishlistItem`) — Saves a product. Idempotent (re-saving returns the same `200`). Rejects non-public products with `404`.
- **`DELETE /wishlist/{productId}`** (`removeWishlistItem`) — Removes a saved line. Returns `404` if the caller doesn't actually hold that line (stale client state).
- **`POST /wishlist/{productId}/move-to-cart`** (`moveWishlistItemToCart`) — Atomically writes to the cart first, then removes the wishlist line; a mid-operation failure leaves the product saved rather than lost.
- **`WishlistItem`** — A single line: just `productId` (a shared `Id`). No quantity by design.
- **`WishlistResponse`** — An array of `WishlistItem`.
- **`WishlistResponseEnvelope`** — Standard `{ success, status, message, data }` wrapper around `WishlistResponse`.
- **`AddWishlistItemRequest`** — Body for `POST /wishlist`; requires `productId`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All standard error responses (`Unauthorized`, `NotFound`, `ValidationError`, `InternalError`), the `ProductIdPathParam` path parameter, the `Id` schema, and the envelope sub-schemas (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) are imported from the shared root. This file contains no inline definitions for those.
- **`src/modules/products/openapi.yaml`** — Wishlist lines reference products by ID only. The `404` on add/move-to-cart for a hidden or soft-deleted product is the catalogue's visibility rule, not a wishlist-specific check; the wishlist delegates product-existence semantics to the products domain.
- **`src/modules/users/openapi.yaml`** — Every operation is scoped to the authenticated user via `bearerAuth`. The wishlist has no user-ID field in its schemas; ownership is implied by the session token and resolved server-side against the user context.

## Notes

- **No quantity anywhere.** `WishlistItem` has exactly one property. If a client needs "how many," it should use the cart or `move-to-cart`.
- **`POST /wishlist` is idempotent.** A duplicate save is a `200`, not a `409` or `422`. This is explicit in the spec description: a double-clicked heart icon is not an error.
- **`move-to-cart` ordering guarantee.** The cart write happens before the wishlist deletion. A failure mid-way leaves the product *saved*, never lost. Clients should re-read the cart for its post-operation state; the response here only reflects the wishlist.
- **The `404` on `move-to-cart` is dual-meaning.** It fires both when the product isn't on the wishlist *and* when the product is no longer publicly visible. The spec notes the latter is really the cart's rule being inherited here.
- All schemas use `additionalProperties: false`, so extra fields in requests/responses are contract violations, not silently ignored.
