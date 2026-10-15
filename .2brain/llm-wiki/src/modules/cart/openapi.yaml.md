---
source: src/modules/cart/openapi.yaml
sha256: 42a9b50d068e265de44704ab42d5ca6ab1665724f7fc579d87ab5f7cfe874ea5
generated_at: 2026-10-15T10:23:58.232423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the cart module. Defines the REST surface (list, add, update, remove, clear, checkout) for a signed-in user's cart and the set of module-specific error codes that checkout and cart mutations can return. Serves as the machine-readable source of truth for client SDK generation and for the shared error-code vocabulary other modules reference.

## Key elements

- **`x-error-codes`** — Module-scoped error catalogue (18 codes). Each entry carries an HTTP status and a human-readable description; several reference `errors[].details` shapes the client must inspect (e.g. per-line stock refusals in `CART_INSUFFICIENT_STOCK`, expected-vs-actual totals in `CART_TOTAL_CHANGED`).
- **`x-personal-data.cart`** — The cart's contribution to the `POST /account/export` response. The bundler splices this schema into `AccountExport`; removing the module removes the section.
- **`tags`** — Single `Cart` tag grouping all operations.
- **`/cart` (GET / POST / DELETE)** — Read cart, add a line (201 new / 200 grow), and remove a line by body (`removeCartItemByBody`, aliased to `removeCartItem`).
- **`/cart/all` (DELETE)** — Bodyless "clear all" operation, deliberately separated from `DELETE /cart` so a missing body 422s rather than silently clearing.
- **`/cart/{productId}` (PUT)** — Set (not increment) the quantity for a path-addressed line; 201 on create, 200 on update.
- **Schemas referenced locally** — `CartResponseEnvelope`, `AddCartItemRequest`, `RemoveCartItemRequest`, `UpdateCartItemByIdRequest`, `CartItem` (the file continues beyond the visible portion with additional paths and the full `components/schemas` block).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every generic error response (401, 403, 404, 422, 500), the `Location` response header, and the `ProductIdPathParam` path parameter are `$ref`-imported from this root contract. This file never re-declares them.
- **`src/modules/delivery/openapi.yaml`** — Cart checkout paths (visible in the truncated portion) depend on delivery/shipping-method concepts; error codes such as `CART_SHIPPING_METHOD_*` and `CART_SHIP_TO_COUNTRY_NOT_SUPPORTED` mirror the delivery module's vocabulary.
- **`src/modules/inventory/module.ts`** — The `CART_INSUFFICIENT_STOCK` error description explicitly defers to `inventory.any.read` for exact stock counts, and stock-availability values (`insufficient_stock`, `out_of_stock`, `unavailable`) originate from the inventory module's domain.

## Notes

- The file is truncated in this snapshot; the `components/schemas` block and any checkout-related paths (`/cart/checkout`, reorder, etc.) are not visible here but are implied by the error-code catalogue and `x-personal-data` references.
- `removeCartItemByBody` is annotated with `x-alias-of: removeCartItem`, signalling it is a body-carrying duplicate of the path-param variant rather than an independent operation.
- `CART_INSUFFICIENT_STOCK` intentionally omits remaining quantity from its response — the contract says callers who need exact stock must read the inventory module directly.
- `CART_TOTAL_CHANGED` uses minor units for `amount` in both `expected` and `actual` details; clients must not assume major units.
