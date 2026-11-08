---
source: src/modules/cart/openapi.yaml
sha256: 25857e677d3b5b3a251afedac5eef09081b29b823a3503e0315f3ab1c84d01a2
generated_at: 2026-11-08T05:15:11.817782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the cart module. Defines the HTTP surface for reading, mutating, and checking out the signed-in user's cart, plus the module's custom error-code vocabulary and its slice of the account data export.

## Key elements

- **Tags** – Single tag `Cart` (x-family `Buying`); all operations file under it.
- **`x-error-codes`** – Module-specific error catalogue (~20 codes). Covers address validation, stock refusal (`CART_INSUFFICIENT_STOCK`, `CART_PRODUCT_UNAVAILABLE`), checkout preconditions (`CART_EMPTY`, `CART_TOTAL_CHANGED`, `CART_PURCHASE_HOLD`, `CART_OPEN_ORDER_LIMIT_REACHED`), shipping-method selection, and email-verification gating.
- **`x-personal-data`** – Declares the `cart` section of `POST /account/export` (`CartItem[]`), so the bundler can compose it into `AccountExportResponse`.
- **`GET /cart`** (`getCart`) – Returns the full cart with a computed `summary`.
- **`POST /cart/items`** (`addCartItem`) – Adds or *grows* a line; always returns `200` with the whole cart (no `201`/`Location`).
- **`DELETE /cart/items`** (`clearCart`) – Empties the cart; bodyless by design (a body triggers `415`).
- **`PATCH /cart/items/{productId}`** (`updateCartItemByProductId`) – Sets (not increments) a line's quantity. Accepts both `application/json` and `application/merge-patch+json`. Never creates a line; unknown product → `404`.
- **`DELETE /cart/items/{productId}`** (`deleteCartItemByProductId`) – Removes one line; returns the updated cart.
- **`PUT /cart/shipping-method`** – Chooses or clears (`null`) the cart's shipping method; re-validated at checkout.
- **Referenced schemas** – `CartResponse`, `CartItem`, `AddCartItemRequest`, `UpdateCartItemByProductIdRequest` (defined in this file's `components/schemas`, truncated in the excerpt).

## Relationships

- **`shared/contracts/openapi.root.yaml`** – `$ref`s for shared responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `UnsupportedMediaType`) and the `ProductIdPathParam` parameter. This file is a leaf that composes those shared definitions.
- **`src/modules/cart/module.ts`** – Runtime implementation of every operation declared here.
- **`src/modules/cart/module.yaml`** – Module metadata (routing, bundling) that pairs with this contract.
- **`src/modules/cart/authorization.yaml`** – Defines the `bearerAuth` security scheme used by every operation in this file.
- **`src/modules/orders/openapi.yaml`** – The checkout endpoints (`POST /orders`, `POST /orders/{id}/cancel`) that `CART_OPEN_ORDER_LIMIT_REACHED` and the tag description point to as the next step after cart operations.

## Notes

- **Add vs. set semantics:** `POST /cart/items` *grows* an existing line (Shopify-style); `PATCH /cart/items/{productId}` *sets* the absolute quantity. They are deliberately different verbs on different URLs.
- **No `201` / no `Location`:** because a line has no independent URL, all mutations return `200` with the full `CartResponse`.
- **Bodyless delete:** `DELETE /cart/items` refuses any body with `415` to prevent a payload from accidentally targeting a single line.
- **Error-code status mapping:** `409` for conflict/state-precondition failures, `422` for validation, `404` for not-found, `403` for `EMAIL_NOT_VERIFIED` (auth-adjacent but not a credentials problem).
- **`x-personal-data` is additive:** removing this key removes the cart section from the account export; it does not alter any endpoint.
