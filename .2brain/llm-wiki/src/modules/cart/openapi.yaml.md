---
source: src/modules/cart/openapi.yaml
sha256: c943f481fc3981f03fa294a991360a4e6bf917a7443057bdc2d85cdc5b5f6cc0
generated_at: 2026-09-23T18:31:18.417430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the cart module. Defines the full REST surface for reading, mutating, and checking out a user's cart, and serves as the single source of truth that both the server implementation and API consumers (or generated clients) agree on.

## Key elements

- **`GET /cart`** (`getCart`) – Returns the full cart plus a computed summary envelope.
- **`POST /cart`** (`upsertCartItem`) – Adds or edits a cart line; the primary mutation endpoint.
- **`DELETE /cart`** (`removeCartItemByBody`) – Removes a line by `productId` carried in the JSON body. Marked `x-alias-of: removeCartItem`.
- **`DELETE /cart/all`** (`clearCart`) – Empties the entire cart; bodyless by design (see Notes).
- **`PUT /cart/{productId}`** (`updateCartItemById`) – Sets quantity for a single line; functionally equivalent to `POST /cart`. Marked `x-alias-of: upsertCartItem`.
- **`DELETE /cart/{productId}`** (`removeCartItem`) – Removes a line by path parameter (the canonical form).
- **`GET /cart/summary`** (`getCartSummary`) – Lightweight cart summary (no full item list).
- **`POST /cart/checkout`** (`checkout`) – Converts cart to an order; returns `201` with OpenAPI **links** to `createPaymentIntent` and `cancelOrderById`. Tagged `Orders` rather than `Cart`.

All operations require `bearerAuth`. Error responses (`401`, `404`, `409`, `422`, `500`) are `$ref`'d to shared definitions rather than inlined.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Every error response (`Unauthorized`, `NotFound`, `ValidationError`, `Conflict`, `InternalError`) and the `ProductIdPathParam` parameter are pulled from this file via relative `$ref` paths. Changes to shared response shapes propagate to this contract automatically.
- **`src/modules/delivery/openapi.yaml`** – The checkout `409` response enumerates shipping-method error codes (`CART_SHIPPING_NOT_APPLICABLE`, `CART_SHIPPING_METHOD_WEIGHT`) that correspond to validation logic living in the delivery module. The two specs are consumed together by any client that handles the full purchase flow.
- **`src/modules/inventory/module.ts`** – The checkout `409` response includes `CART_INSUFFICIENT_STOCK`, indicating the server consults the inventory module during checkout. The cart spec documents the contract; the inventory module enforces stock.

## Notes

- **Body-vs-path aliasing is deliberate.** `DELETE /cart` (body) and `DELETE /cart/{productId}` (path) hit the same use case; the body variant exists so callers who can't embed an id in the URL can still remove a line. The `x-alias-of` extension makes the equivalence machine-readable.
- **`/cart/all` exists to prevent silent cart-clearing.** If a `DELETE /cart` request's body is stripped in transit, the controller returns `422` rather than falling through to "delete everything." The destructive operation therefore has its own dedicated URL.
- **422 vs 404 convention.** `422` means the id (path or body) is _malformed_ (e.g., not a valid ObjectId). `404` means the id is well-formed but matches no product or cart line. This split is called out in inline comments on the affected operations.
- **Checkout is account-bound.** The order email is always the authenticated caller's; there is no `email` field in `CheckoutRequest`. A future guest-checkout extension would add one.
- **Truncated file.** The source provided cuts off mid-way through the checkout `409` response; the `components` section (schemas, security schemes) is not visible. The full file will contain `CartResponseEnvelope`, `UpsertCartItemRequest`, `RemoveCartItemRequest`, `UpdateCartItemByIdRequest`, `CartSummaryResponseEnvelope`, `CheckoutRequest`, `CheckoutResponseEnvelope`, and the `bearerAuth` security scheme.
