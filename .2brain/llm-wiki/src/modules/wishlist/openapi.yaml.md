---
source: src/modules/wishlist/openapi.yaml
sha256: 0d35e59b935ac8be4b90082a5d2b4eed6c277af1fa16759aa46adb09c2a690d7
generated_at: 2026-11-08T09:13:17.068321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract that defines the wishlist REST API (list, save, remove, move-to-cart) and the schemas those endpoints use. It exists so that the module's HTTP surface, error semantics, and personal-data export shape are specified declaratively and consumed by both the runtime (`module.ts`) and external tooling without reading implementation code.

## Key elements

- **`tags`** — Declares the `Wishlist` tag with `x-family: Catalogue`, grouping all operations under the catalogue domain.
- **`x-personal-data`** — Adds a `wishlist` section to the account-export response (`POST /account/export`). The bundler merges it into `AccountExportResponse`; removing this file removes the section.
- **`GET /wishlist`** (`getWishlist`) — Returns the authenticated user's saved product IDs. Never 404; absence and emptiness are the same state.
- **`POST /wishlist/items`** (`createWishlistItem`) — Saves a product (idempotent: re-saving answers 200, no side-effects). Returns the full updated wishlist.
- **`DELETE /wishlist/items/{productId}`** (`deleteWishlistItem`) — Removes one saved line; 404 if the line isn't in the caller's wishlist.
- **`POST /wishlist/items/{productId}/move-to-cart`** (`moveWishlistItemToCart`) — Transfers a saved line into the cart (qty 1, increments if already present) and removes it from the wishlist. Shoppers only (staff/admin get 403). Cart is written before the wishlist line is deleted.
- **`WishlistItem`** — A line is `productId` + `availability` only. No quantity field by design.
- **`WishlistExportItem`** — Stored line as carried in the personal-data export (`productId` only; availability is live shop state, not user data).
- **`WishlistResponse`** — Envelope: `{ items: WishlistItem[] }`.
- **`CreateWishlistItemRequest`** — Body for save: single required `productId`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared building blocks are `$ref`'d from here: the `Id` schema, `ProductIdPathParam`, and the standard error responses (Unauthorized, NotFound, ValidationError, Forbidden). This file never redefines them.
- **`src/modules/cart/openapi.yaml`** — `WishlistItem.availability` is a `$ref` to the cart module's `LineAvailability` schema, so wishlist availability vocabulary stays identical to cart's. The move-to-cart endpoint is the sole cross-module write boundary.
- **`src/modules/wishlist/module.ts`** — Implements the operations declared here; `operationId` values are the join key between this spec and the route handlers.

## Notes

- **No quantity, ever.** A wishlist line deliberately carries no count. The moment quantity matters, the product belongs in the cart.
- **Move-to-cart is the only exit.** There is no bulk-delete or "clear all" endpoint; removal is per-line only.
- **Availability vocabulary is borrowed, not owned.** `WishlistItem.availability` reuses the cart schema, so adding a new availability state to the cart automatically widens the wishlist's set. `insufficient_stock` is explicitly noted as never appearing on a wishlist line.
- **404 on move-to-cart is the cart's answer.** A saved line outlives catalogue changes; whether a product may enter a basket is decided by the cart module, and this spec inherits that 404 semantics rather than re-deriving it.
- **Idempotent save, non-idempotent delete.** Re-saving a product is a no-op 200; deleting an absent line is a 404. Asymmetric on purpose.
