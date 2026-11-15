---
source: src/modules/wishlist/openapi.yaml
sha256: ac6a60ecbd00a3a5b60ef5bea5158e109398877cc4d121a4dfe1c0108242a7f6
generated_at: 2026-11-14T22:53:30.326475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **Wishlist** module: the four endpoints that let an authenticated user save, inspect, remove, and move product references (no quantities) in a personal list capped at `NODE_WISHLIST_MAX` (250 by default). It also declares the module's contribution to the account-data export and its custom error-code vocabulary.

## Key elements

- **`GET /wishlist`** (`getWishlist`) — Returns the full list of saved `productId` values. Never 404; absence ≡ emptiness. Never paginated.
- **`POST /wishlist/items`** (`createWishlistItem`) — Adds a product by id. Idempotent (re-saving returns 200, no side-effects). 404 if the product is hidden/soft-deleted; 409 `WISHLIST_LIMIT_REACHED` if the list is full and the product is new.
- **`DELETE /wishlist/items/{productId}`** (`deleteWishlistItem`) — Removes one line; 404 if the caller does not hold it.
- **`POST /wishlist/items/{productId}/move-to-cart`** (`moveWishlistItemToCart`) — Transfers the line into the cart (qty 1, incremented if present). Cart is written *before* the wishlist line is removed, so a partial failure leaves the product saved. Inherits cart-side 409/422 error codes.
- **`x-error-codes`** — Module-scoped error codes: `WISHLIST_LIMIT_REACHED` (409).
- **`x-personal-data.wishlist`** — Declares the section added to `POST /account/export` by the bundler; removing the module removes the section.
- **`WishlistItem`** — `{ productId, availability }`; deliberately no quantity. Availability reuses the cart's `LineAvailability` but can never be `insufficient_stock`.
- **`WishlistExportItem`** — Only `productId`; availability is the shop's live state, not user data.
- **`CreateWishlistItemRequest`** — Single required field `productId` (shared `Id` schema).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Supplies all cross-module shared responses (`Unauthorized`, `NotFound`, `Conflict`, `ValidationError`, `Forbidden`), the `ProductIdPathParam` parameter, and the `Id` schema. This file references them via relative `$ref` paths rather than redefining them.
- **`src/modules/cart/openapi.yaml`** — This file `$ref`s the `LineAvailability` schema defined there (used by `WishlistItem.availability`). The move-to-cart endpoint also surfaces cart-defined error codes (`CART_LINE_LIMIT_REACHED`, `CART_QUANTITY_LIMIT`) even though it lives under `/wishlist/…`.
- **`src/modules/wishlist/module.ts`** — The module bootstrap that registers this spec's paths into the application and wires the `x-personal-data` section into the account-export pipeline.

## Notes

- **No DELETE for the whole list.** There is no `DELETE /wishlist`; removal is per-line only.
- **`availability` on export is excluded.** `WishlistExportItem` carries only `productId` because stock status is shop state, not account data.
- **`purchasable: false` is allowed on save.** A product taken off sale can still be wishlisted; it only blocks *cart* operations.
- **Move-to-cart is the only cross-module write.** It writes the cart first, then removes the wishlist line. A 409/422 from the cart side means the wishlist line is *unaffected*.
- **`additionalProperties: false`** on every request/response schema—strict shape; clients cannot smuggle extra fields.
