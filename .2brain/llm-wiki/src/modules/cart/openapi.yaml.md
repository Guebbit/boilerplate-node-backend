---
source: src/modules/cart/openapi.yaml
sha256: 43869116225b59850bcc368b4b12363b18a3266aea45508014359ca372263c76
generated_at: 2026-09-27T14:45:08.942842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the Cart module (v2.0.0). Defines the full REST surface for reading, mutating, and clearing a user's cart, choosing a shipping method, and converting the cart into an order at checkout. Serves as the single source of truth for client codegen and API documentation for this module.

## Key elements

- **`GET /cart`** (`getCart`) — Returns all cart items plus a computed `summary` block.
- **`POST /cart`** (`upsertCartItem`) — Adds or edits a product line; the canonical "upsert" operation.
- **`DELETE /cart`** (`removeCartItemByBody`, `x-alias-of: removeCartItem`) — Removes a line by `productId` carried in the JSON body. Deliberately kept separate from `DELETE /cart/all` so a stripped/malformed body 422s rather than silently clearing the cart.
- **`DELETE /cart/all`** (`clearCart`) — Bodyless; empties the entire cart.
- **`PUT /cart/{productId}`** (`updateCartItemById`, `x-alias-of: upsertCartItem`) — Functionally equivalent to `POST /cart`; sets a line's quantity.
- **`DELETE /cart/{productId}`** (`removeCartItem`) — Removes a line identified by path parameter (the primary spelling; the body variant above is its alias).
- **`PUT /cart/shipping-method`** (`setCartShippingMethod`) — Selects or clears (`null`) the planned shipping method. Priced against the current basket; checkout re-validates independently.
- **`GET /cart/summary`** (`getCartSummary`) — Lightweight cart summary without the full item list.
- **`POST /cart/checkout`** (`checkout`) — Converts the cart into a new order (201). Cart is cleared on success. Accepts an `Idempotency-Key` header. Account-bound: the order email is always the caller's.

Schemas defined (or expected) in this spec: `CartResponseEnvelope`, `UpsertCartItemRequest`, `RemoveCartItemRequest`, `UpdateCartItemByIdRequest`, `SetCartShippingMethodRequest`, `CartSummaryResponseEnvelope`, `CheckoutRequest`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All error responses (`Unauthorized`, `InternalError`, `NotFound`, `ValidationError`, `Conflict`) and shared parameters (`ProductIdPathParam`, `IdempotencyKeyHeader`) are `$ref`-ed from this file via the relative path `../../../shared/contracts/openapi.root.yaml`. No error body is duplicated locally.
- **`src/modules/delivery/openapi.yaml`** — `PUT /cart/shipping-method` references the delivery module's method catalogue (`GET /delivery/methods`) both in prose and semantically: a 404 is returned when the named method matches none, and a 409 is returned when the basket's weight falls outside the method's `minWeight`/`maxWeight` or when every item is `requiresShipping: false`.
- **`src/modules/inventory/module.ts`** — The 404 on `POST /cart` and `PUT /cart/{productId}` (product id that matches no product) implies the cart controller validates product existence against the inventory module before persisting a line.

## Notes

- **`x-alias-of` extension** — Two operations (`removeCartItemByBody`, `updateCartItemById`) carry this vendor extension to signal they are alternate spellings of a canonical operation. Tooling that deduplicates by `operationId` should treat the alias as the same logical operation.
- **422 vs 404 convention** — A *malformed* identifier (bad ObjectId shape) → 422; a *well-formed but unknown* identifier → 404. This distinction is called out in inline comments and is intentional.
- **Shipping method is provisional** — `PUT /cart/shipping-method` validates against the basket *at that moment*. Checkout performs its own independent re-validation; a cart that changes after the method was chosen may hit a 409 at checkout time.
- **Relative `$ref` depth** — Shared-contract references use a three-level `../../../` path. Moving this file in the tree will break those refs.
- **Truncation** — The `POST /cart/checkout` 201 response schema and any `components` section were cut off in the source; the full file likely contains additional 4xx/5xx responses for checkout and the schema definitions listed above.
