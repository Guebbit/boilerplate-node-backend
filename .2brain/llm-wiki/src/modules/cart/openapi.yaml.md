---
source: src/modules/cart/openapi.yaml
source_sha256: a84da4f3a6716a2f63434623a6fd8c399faebf94139eb4598a094869a6c38868
context_sha256: d3d3c6a420823fe096723a96900f11ea1be43e7524312c822dcf89d5551a25b6
generated_at: 2026-11-22T04:33:58.858858+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the `cart` module (v0.1.0). It declares the module's `Cart` tag, its error codes, its section of the account data export, and the HTTP operations on the signed-in user's cart, including turning the cart into an order.

## Key elements
- **`tags`**: a single `Cart` tag, with `x-family: Buying`.
- **`x-error-codes`**: the module's error catalogue, each entry with an HTTP status and a description. Examples:
  - Address and shipping: `CART_ADDRESS_*`, `CART_BILLING_ADDRESS_REQUIRED`, `CART_SHIPPING_*`, `CART_SHIP_TO_COUNTRY_NOT_SUPPORTED`.
  - Cart state and limits: `CART_CHANGED`, `CART_EMPTY`, `CART_LINE_LIMIT_REACHED`, `CART_QUANTITY_LIMIT`.
  - Stock and products: `CART_INSUFFICIENT_STOCK`, `CART_PRODUCT_UNAVAILABLE`.
  - Checkout: `CART_TOTAL_CHANGED`, `CART_OPEN_ORDER_LIMIT_REACHED`, `CART_PURCHASE_HOLD`, `CART_PAYMENT_METHOD_NOT_AVAILABLE`.
  - Related codes: `EMAIL_NOT_VERIFIED` (403) and `REORDER_UNAVAILABLE` (409).
- **`x-personal-data`**: adds a `cart` section (an array of `CartItem`) to the `POST /account/export` response (`AccountExportResponse`). Removing the module removes the section.
- **Paths visible in this excerpt** (all use `bearerAuth`, and all return `CartResponse` on 200):
  - `GET /cart` (`getCart`): returns the cart with a computed summary. It is never paginated, since a cart holds at most `NODE_CART_MAX_LINES` lines (100 by default).
  - `POST /cart/items` (`addCartItem`): adds a product, or grows an existing line by `quantity`. It takes an `Idempotency-Key` header. Errors are 409 `CART_LINE_LIMIT_REACHED` or `IDEMPOTENCY_IN_FLIGHT`, and 422 `CART_QUANTITY_LIMIT` or `IDEMPOTENCY_KEY_MISMATCH`.
  - `DELETE /cart` (`clearCart`): empties the cart. It has no body, and a body is refused with 415. It also answers 200 when the cart is already empty.
  - `PATCH /cart/items/{productId}` (`updateCartItemByProductId`): sets the line quantity rather than incrementing it. It accepts `application/json` and `application/merge-patch+json`. It never creates a line. A missing line gives 404 `cart.item-not-found`, and a product the storefront no longer shows gives 404 `products.not-found`.
  - `DELETE /cart/items/{productId}`: removes a line. Its description is cut off in the visible content.
- **Schemas** referenced from `#/components/schemas`: `CartResponse`, `CartItem`, `AddCartItemRequest`, `UpdateCartItemByProductIdRequest`.

## Relationships
- `src/modules/cart/authorization.yaml` is a sibling file in the same module. Only the `bearerAuth` security scheme and the `read:StockLevel` permission mentioned in `CART_INSUFFICIENT_STOCK` are visible here, so the detailed link between the two files is not shown.

## Notes
- Operations list the codes they can return in `x-error-codes` per status, and some of those codes (`IDEMPOTENCY_*`) are not defined in this file.
- Adding to the cart and setting a quantity are deliberately separate operations: `POST` adds to the existing quantity, while `PATCH` sets it.
- Writes return the whole cart with 200, with no `Location` header.
- Stock detail is withheld from buyers. `CART_INSUFFICIENT_STOCK` reports each refused line's `availability` but not the quantity left.
- Responses and parameters such as `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `UnsupportedMediaType`, `IdempotencyKeyHeader` and `ProductIdPathParam` are referenced from an external shared root contract rather than defined here.
- Several error descriptions mention endpoints and limits defined elsewhere: `NODE_CART_MAX_LINES`, `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`, `POST /payments`, `POST /orders/{id}/cancel`, and `POST /account/email-verification/resend`.
