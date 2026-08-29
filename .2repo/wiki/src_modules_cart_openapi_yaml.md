# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) defining the public HTTP API for the cart module: reading/updating cart lines, computing summaries, checking out into an order, and reordering from a past order. It is the single source of truth for endpoint shapes, status codes, and request/response schemas that the cart implementation must satisfy.

## Key elements

- **Paths & operations**
  - `GET /cart` — `getCart`; returns the full cart with a computed summary.
  - `POST /cart` — `upsertCartItem`; add or update a line (product + quantity in body).
  - `DELETE /cart` — `clearCart`; optional `RemoveCartItemRequest` body targets one product; omitting it empties the whole cart.
  - `PUT /cart/{productId}` — `updateCartItemById`; quantity-only update. Annotated `x-alias-of: upsertCartItem` to signal it is functionally equivalent to the POST variant.
  - `DELETE /cart/{productId}` — `removeCartItem`; remove a single line.
  - `GET /cart/summary` — `getCartSummary`; lightweight aggregate (no full line list).
  - `POST /cart/checkout` — `checkout` (tag `Orders`); converts cart → order, clears cart on success. Returns `201` with `CheckoutResponseEnvelope`.
  - `POST /cart/reorder/{orderId}` — `reorder`; copies a past order's lines back into the caller's cart, re-resolving products against the live catalogue.

- **Local component schemas** (under `components/schemas`)
  - `CartResponseEnvelope` / `CartSummaryResponseEnvelope` — envelope wrappers (`success`, `status`, `message`, `data`) around `CartResponse` / summary data.
  - `UpsertCartItemRequest`, `UpdateCartItemByIdRequest`, `RemoveCartItemRequest` — request bodies.
  - `CheckoutRequest`, `CheckoutResponseEnvelope` — checkout-specific shapes.
  - (Further schemas are present in the truncated remainder of the file.)

- **Security** — every operation requires `bearerAuth`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the primary dependency. The cart spec `$ref`s it for:
  - Common error responses (`401 Unauthorized`, `404 NotFound`, `422 ValidationError`, `409 Conflict`, `500 InternalError`).
  - The `ProductIdPathParam` parameter (used on `/cart/{productId}`).
  - Envelope base types (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) and the `Id` schema (used on the `orderId` path param).
- **`src/modules/account/openapi.yaml`** — checkout references the caller's saved addresses (`addressId`); a `404` with code `CART_ADDRESS_NOT_FOUND` is returned when the address belongs to a different user. No direct YAML `$ref` between the two files; the coupling is via the authenticated identity and address data.
- **`src/modules/delivery/openapi.yaml`** — checkout produces an order that downstream delivery consumes. Again no direct `$ref` in this file; the relationship is sequential (cart → order → delivery) and reflected in the `CheckoutResponseEnvelope` shape.

## Notes

- `PUT /cart/{productId}` is an **alias** of `POST /cart` (see `x-alias-of`), not a distinct operation. Clients should treat them interchangeably; the PUT form is a convenience for RESTful quantity updates.
- `DELETE /cart` is overloaded: it clears the whole cart **or** removes a single item depending on whether the (optional) request body names a `productId`. Clients must send the body explicitly to target one line.
- `POST /cart/checkout` returns **201** (not 200) on success and **409 Conflict** when the cart is empty — a status the implementation always returned but the spec historically never declared.
- `POST /cart/reorder/{orderId}` silently **skips** products no longer in the catalogue (removed, deactivated, hidden) and returns the cart as actually filled; if *every* line is unavailable it returns **409** with code `REORDER_UNAVAILABLE`.
- All error responses reuse the shared-envelope pattern from `openapi.root.yaml`; module-specific error codes are carried in `errors[].code` within the shared `ValidationError` / `NotFound` / `Conflict` bodies rather than in bespoke schemas.
