---
source: src/modules/cart/openapi.yaml
sha256: df6391c1a7f984008b0da0985a5c43bf11ce097e7ddf07ebf47607e31bf07bec
generated_at: 2026-10-29T03:22:29.343600+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **Cart** module. It defines the REST surface for managing a signed-in user's shopping basket (add, remove, clear, set quantities, choose a shipping method) and declares the module's full error-code taxonomy. Serves as the single source of truth for client SDKs, documentation generation, and the account-data-export bundler.

## Key elements

- **`x-error-codes`** (vendor extension) — 19 module-specific error codes (e.g. `CART_CHANGED`, `CART_INSUFFICIENT_STOCK`, `CART_PURCHASE_HOLD`, `CART_TOTAL_CHANGED`) with status, description, and `errors[].details` shape. Shared errors (401/403/404/415/422) are still pulled from the root contract.
- **`x-personal-data`** (vendor extension) — Declares the `cart` array section contributed to `POST /account/export`; the bundler merges it into `AccountExportResponse`.
- **`tags: [Cart]`** — All operations file under the single "Cart" tag.
- **Paths & operations**
  - `GET /cart` (`getCart`) — Return current cart + computed summary.
  - `POST /cart/items` (`addCartItem`) — Add *or grow* an existing line (additive, not upsert).
  - `DELETE /cart/items` (`clearCart`) — Empties the cart; bodyless by design (body → 415).
  - `PATCH /cart/items/{productId}` (`updateCartItemById`) — Set absolute quantity; never creates a line. Accepts `application/json` **and** `application/merge-patch+json`.
  - `DELETE /cart/items/{productId}` (`removeCartItem`) — Remove one line.
  - `PUT /cart/shipping-method` (`setCartShipping`) — Set or clear (`null`) the planned shipping method; returns priced summary.
- **Shared `$ref`s** — Common responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `UnsupportedMediaType`) and `ProductIdPathParam` all resolve into `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Parent contract. Every shared response object and the `ProductIdPathParam` parameter are `$ref`'d from this file; the cart spec only adds module-specific paths and extensions on top.
- **`src/modules/delivery/openapi.yaml`** — The `PUT /cart/shipping-method` description points callers to `GET /delivery/methods` for the method catalog; the cart consumes delivery's method list to price and validate the chosen method.
- **`src/modules/inventory/module.ts`** — The `CART_INSUFFICIENT_STOCK` error code references the `read:StockLevel` capability and availability states (`insufficient_stock`, `out_of_stock`, `unavailable`) that the inventory module produces; checkout stock-checking depends on inventory's data.

## Notes

- **Additive vs. set semantics:** `POST /cart/items` *grows* a line (press twice → +2); `PATCH /cart/items/{productId}` *sets* an absolute quantity. Mixing them up changes behavior silently.
- **`DELETE /cart/items` rejects any request body (415)** to prevent a one-line `DELETE /cart/items/{productId}` from being widened into a full clear.
- **`x-error-codes` is a custom vendor extension** (`x-` prefix), not standard OpenAPI. Tooling that doesn't understand it will simply ignore the block; the actual `responses` on each operation still reference the generic shared 4xx objects.
- **`CART_INSUFFICIENT_STOCK`** intentionally omits the remaining-stock number from the response ("exact stock is for callers who read it") to avoid leaking inventory data.
- **Checkout re-validates from scratch** regardless of what `PUT /cart/shipping-method` accepted earlier, since the basket may have mutated in between.
