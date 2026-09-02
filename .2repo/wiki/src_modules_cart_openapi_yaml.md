# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the **cart** module (v2.0.0). It defines every endpoint a client can call to inspect, mutate, and consume a per-user shopping cart, including checkout and reorder flows. Serves as the single source of truth for request/response shapes, error semantics, and endpoint aliases within the cart domain.

## Key elements

- **`GET /cart`** (`getCart`) — Returns the full cart with a computed summary (`CartResponseEnvelope`).
- **`POST /cart`** (`upsertCartItem`) — Adds or edits a line; returns the updated cart.
- **`DELETE /cart`** (`removeCartItemByBody`, alias of `removeCartItem`) — Removes a line by `productId` in the body; 422 on a missing/malformed id rather than falling back to a full clear.
- **`DELETE /cart/all`** (`clearCart`) — Empties the cart entirely; bodyless by design.
- **`PUT /cart/{productId}`** (`updateCartItemById`, alias of `upsertCartItem`) — Sets a line's quantity by path parameter; functionally equivalent to `POST /cart`.
- **`DELETE /cart/{productId}`** (`removeCartItem`) — Removes a line by path parameter.
- **`GET /cart/summary`** (`getCartSummary`) — Lightweight cart summary (`CartSummaryResponseEnvelope`).
- **`POST /cart/checkout`** (`checkout`) — Converts the cart into an order; clears the cart on success. Supports optional `email`, `notes`, `addressId`, `shippingMethodId`. Returns 201 with `CheckoutResponseEnvelope`.
- **`POST /cart/reorder/{orderId}`** (`reorder`) — Copies lines from one of the caller's past orders back into the cart, re-resolving against the live catalogue; skips removed/deactivated products.
- **Shared schemas referenced locally:** `CartResponseEnvelope`, `UpsertCartItemRequest`, `RemoveCartItemRequest`, `UpdateCartItemByIdRequest`, `CartSummaryResponseEnvelope`, `CheckoutRequest`, `CheckoutResponseEnvelope`.
- **Custom vendor extensions:** `x-alias-of` marks endpoints that are syntactic variants of a canonical operation.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every error response (`401`, `404`, `409`, `422`, `500`), the `ProductIdPathParam` parameter, and the `Id` schema are pulled from the root contract via `$ref`, keeping error semantics and shared types DRY across all module specs.
- **`src/modules/account/openapi.yaml`** — The `addressId` field on `POST /cart/checkout` and the caller-scoped order lookup on `POST /cart/reorder/{orderId}` depend on account-owned data (saved addresses, the caller's order history).
- **`src/modules/delivery/openapi.yaml`** — The `shippingMethodId` on checkout and the `requiresShipping` product flag interact with the delivery module's shipping-method catalogue; a shipping method supplied for a fully digital cart is a 409, not a delivery lookup.

## Notes

- **Alias pattern:** `removeCartItemByBody` and `updateCartItemById` carry `x-alias-of` to make explicit that they are alternate spellings, not separate operations. Tools should treat the canonical `operationId` as the single logical action.
- **404 vs 422 split on deletes:** A well-formed id that matches nothing → 404; a malformed or missing id → 422 (the controller validates before querying). This is intentional and documented in inline comments; don't "simplify" to a single code.
- **`DELETE /cart` does NOT clear the cart.** A stripped body 422s rather than silently falling through to `DELETE /cart/all`. Callers wanting a full clear must hit `/cart/all`.
- **Checkout uses 409 (Conflict), not 422, for domain rejections** (empty cart, insufficient stock, concurrent checkout, shipping not applicable). The `errors[].code` field (`CART_EMPTY`, `CART_INSUFFICIENT_STOCK`, `CART_CHANGED`, `CART_SHIPPING_NOT_APPLICABLE`, `CART_ADDRESS_NOT_FOUND`) disambiguates the case.
- **Reorder is scoped to the caller's own orders**, even for admins; the cart being filled is always the caller's.
- **Checkout request body is optional** (`required: false`)—an empty body is valid and simply omits email/notes/address/shipping overrides.
