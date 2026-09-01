# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) for the cart module. It defines the full HTTP surface a client can use to read, mutate, clear, and act on a user's shopping cart, including checkout and reorder operations. Serves as the machine-readable specification from which client SDKs, server-side validation, and documentation are generated.

## Key elements

- **`GET /cart`** (`getCart`) — returns the full cart with computed summary.
- **`POST /cart`** (`upsertCartItem`) — adds or updates a product line; the canonical "write a line" endpoint.
- **`DELETE /cart`** (`removeCartItemByBody`, `x-alias-of: removeCartItem`) — removes a line by `productId` carried in the request body.
- **`DELETE /cart/all`** (`clearCart`) — bodyless; empties the entire cart. Deliberately a separate URL so a missing body on `DELETE /cart` yields 422 instead of silently clearing.
- **`PUT /cart/{productId}`** (`updateCartItemById`, `x-alias-of: upsertCartItem`) — sets a line's quantity by path parameter; functionally equivalent to `POST /cart`.
- **`DELETE /cart/{productId}`** (`removeCartItem`) — removes a line by path parameter (the canonical spelling; `DELETE /cart` body form is its alias).
- **`GET /cart/summary`** (`getCartSummary`) — lightweight cart summary without full line items.
- **`POST /cart/checkout`** (`checkout`) — converts the cart into a new order; clears the cart on success; optional `addressId` and notes in the body.
- **`POST /cart/reorder/{orderId}`** (`reorder`) — copies a past order's lines back into the caller's cart, re-resolving each against the current catalogue.
- **Schemas (local `#/components/schemas/…`)** — `CartResponseEnvelope`, `UpsertCartItemRequest`, `RemoveCartItemRequest`, `UpdateCartItemByIdRequest`, `CartSummaryResponseEnvelope`, `CheckoutRequest`, `CheckoutResponseEnvelope` (content truncated; full definitions live in the file's components block).
- **`x-alias-of` extension** — marks `removeCartItemByBody` → `removeCartItem` and `updateCartItemById` → `upsertCartItem` as alternate spellings of a single logical operation.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every error response (401 Unauthorized, 404 NotFound, 409 Conflict, 422 ValidationError, 500 InternalError) is `$ref`'d from this shared file, as are the `ProductIdPathParam` parameter and the `Id` schema used by `/cart/reorder/{orderId}`. This is the single source of truth for cross-module response and parameter shapes.
- **`src/modules/account/openapi.yaml`** — graph neighbor via the checkout flow: the 404 comment references "the caller's saved addresses," tying `CheckoutRequest.addressId` to the account module's address collection. No direct `$ref` into account's spec; the link is semantic.
- **`src/modules/delivery/openapi.yaml`** — graph neighbor in the checkout → delivery hand-off. No direct `$ref` visible in this file; the relationship is downstream (an order created here is consumed by delivery).

## Notes

- **Alias pairs, not duplicates.** `x-alias-of` exists so tooling can deduplicate; the two spellings share identical semantics. Treat `removeCartItem` (path form) and `upsertCartItem` (POST body form) as the canonical operations.
- **404 vs 422 distinction is intentional.** A well-formed id that matches nothing → 404. A malformed/missing id (e.g. not a valid ObjectId, or a stripped body) → 422. The controller validates before querying.
- **`DELETE /cart/all` is separate on purpose.** Prevents a body stripped in transit on `DELETE /cart` from silently clearing the entire cart.
- **Checkout returns 201**, not 200 — it creates a new resource (the order).
- **Reorder skips unavailable products silently.** The returned cart is the authoritative record of what actually landed; no separate "skipped items" list is declared in the visible portion.
- **All endpoints require `bearerAuth`**; there is no public/unauthenticated surface.
